const env = require('../config/env');
const sessionModel = require('../models/session.model');
const messageLogModel = require('../models/messageLog.model');
const wiraService = require('../services/wira.service');
const whatsappService = require('../services/whatsapp.service');

/**
 * Handle Meta webhook GET verification
 */
const verifyWebhook = (req, res) => {
    try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
                console.log('[Webhook] Webhook verified successfully.');
                return res.status(200).send(challenge);
            } else {
                console.warn('[Webhook] Verification failed: Token mismatch.');
                return res.sendStatus(403);
            }
        }
        return res.sendStatus(400);
    } catch (error) {
        console.error('[Webhook] Verification error:', error.message);
        return res.status(500).send(error.message);
    }
};

/**
 * Process the incoming WhatsApp message payload in the background
 */
const processIncomingMessage = async (body) => {
    try {
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        const messages = value?.messages;
        const statuses = value?.statuses;

        // 1. Ignore status updates (sent, delivered, read) without messages
        if (statuses && (!messages || messages.length === 0)) {
            console.log('[Webhook] No messages found, status event or unsupported payload');
            return;
        }

        // 2. Validate messages structure
        const msg = messages?.[0];
        if (!msg) {
            console.log('[Webhook] No messages found, status event or unsupported payload');
            return;
        }

        // 3. Process text, image, document, audio, location, and interactive messages
        const allowedTypes = ['text', 'image', 'document', 'audio', 'location', 'interactive'];
        if (!allowedTypes.includes(msg.type)) {
            console.log(`[Webhook] Ignoring unsupported message type: ${msg.type}`);
            return;
        }

        // 4. Extract variables
        const fromPhone = msg.from || value.contacts?.[0]?.wa_id;
        const messageId = msg.id;
        const phoneId = value.metadata?.phone_number_id || env.WHATSAPP_PHONE_NUMBER_ID;

        if (!fromPhone || !messageId) {
            console.warn('[Webhook Error] Missing recipient number (from) or message ID in payload.');
            return;
        }

        let messageText = '';
        let mediaInfo = null;

        if (msg.type === 'text') {
            messageText = msg.text?.body || '';
        } else if (msg.type === 'interactive') {
            const interactive = msg.interactive;
            if (interactive?.type === 'button_reply') {
                const btn = interactive.button_reply;
                const btnId = btn?.id || '';
                const btnTitle = btn?.title || '';
                if (btnId && !btnId.startsWith('btn_')) {
                    messageText = btnId;
                } else {
                    messageText = btnTitle;
                }
            } else if (interactive?.type === 'list_reply') {
                const listReply = interactive.list_reply;
                const replyDesc = listReply?.description || '';
                const replyId = listReply?.id || '';
                const replyTitle = listReply?.title || '';

                // Prioritize full untruncated sentence: description first, then non-synthetic id, then title
                if (replyDesc) {
                    messageText = replyDesc;
                } else if (replyId && !replyId.startsWith('opt_')) {
                    messageText = replyId;
                } else {
                    messageText = replyTitle;
                }
            }
            console.log(`[Webhook] Processing incoming interactive reply from ${fromPhone}: "${messageText}"`);
        } else if (msg.type === 'image') {
            const mediaId = msg.image?.id;
            const caption = msg.image?.caption || '';
            console.log(`[Webhook] Processing incoming image with ID: ${mediaId}`);
            
            try {
                const downloaded = await whatsappService.downloadWhatsAppMedia(mediaId);
                const publicUrl = `${env.APP_URL}${downloaded.relativePath}`;
                mediaInfo = {
                    mediaId,
                    mimeType: downloaded.mimeType,
                    filename: downloaded.filename,
                    url: publicUrl
                };
                messageText = caption ? `${caption} (File: ${publicUrl})` : publicUrl;
            } catch (mediaErr) {
                console.error('[Webhook Media Error] Failed to process image:', mediaErr.message);
                messageText = `[Image Error: Failed to download media ID ${mediaId}]`;
            }
        } else if (msg.type === 'document') {
            const mediaId = msg.document?.id;
            const originalFilename = msg.document?.filename || 'document';
            const caption = msg.document?.caption || '';
            console.log(`[Webhook] Processing incoming document: ${originalFilename} with ID: ${mediaId}`);
            
            try {
                const downloaded = await whatsappService.downloadWhatsAppMedia(mediaId, originalFilename);
                const publicUrl = `${env.APP_URL}${downloaded.relativePath}`;
                mediaInfo = {
                    mediaId,
                    mimeType: downloaded.mimeType,
                    filename: downloaded.filename,
                    url: publicUrl
                };
                messageText = caption ? `${caption} (File: ${publicUrl})` : publicUrl;
            } catch (mediaErr) {
                console.error('[Webhook Media Error] Failed to process document:', mediaErr.message);
                messageText = `[Document Error: Failed to download media ID ${mediaId}]`;
            }
        } else if (msg.type === 'audio') {
            const mediaId = msg.audio?.id;
            console.log(`[Webhook] Processing incoming audio/voice with ID: ${mediaId}`);
            
            try {
                const downloaded = await whatsappService.downloadWhatsAppMedia(mediaId);
                const publicUrl = `${env.APP_URL}${downloaded.relativePath}`;
                mediaInfo = {
                    mediaId,
                    mimeType: downloaded.mimeType,
                    filename: downloaded.filename,
                    url: publicUrl
                };
                messageText = publicUrl;
            } catch (mediaErr) {
                console.error('[Webhook Media Error] Failed to process audio:', mediaErr.message);
                messageText = `[Audio Error: Failed to download media ID ${mediaId}]`;
            }
        } else if (msg.type === 'location') {
            const lat = msg.location?.latitude;
            const lng = msg.location?.longitude;
            const name = msg.location?.name;
            const address = msg.location?.address;
            
            console.log(`[Webhook] Processing incoming location: Lat ${lat}, Lng ${lng}`);
            
            let locDetails = [];
            if (name) locDetails.push(`Name: ${name}`);
            if (address) locDetails.push(`Address: ${address}`);
            locDetails.push(`Coordinates: ${lat},${lng}`);
            locDetails.push(`Google Maps: https://www.google.com/maps?q=${lat},${lng}`);
            
            messageText = locDetails.join('\n');
            mediaInfo = {
                latitude: lat,
                longitude: lng,
                name: name || null,
                address: address || null,
                googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`
            };
        }

        console.log(`[Webhook] Parsed ${msg.type} message from ${fromPhone}: ${messageText}`);

        // 5. Prevent duplicate processing using message id
        const isDuplicate = await messageLogModel.isDuplicateMessage(messageId);
        if (isDuplicate) {
            console.log(`[Webhook] Duplicate message ID detected: ${messageId}. Skipping.`);
            return;
        }

        // 6. Log the incoming message to database
        try {
            await messageLogModel.logMessage({
                whatsappNumber: fromPhone,
                messageId: messageId,
                direction: 'incoming',
                messageType: msg.type,
                messageText: messageText,
                rawPayload: {
                    ...msg,
                    _mediaInfo: mediaInfo
                }
            });
        } catch (dbErr) {
            // If the query failed because of UNIQUE key constraint, it's a duplicate message
            if (dbErr.code === 'ER_DUP_ENTRY') {
                console.log(`[Webhook] Duplicate entry in DB for message ID: ${messageId}. Skipping.`);
                return;
            }
            throw dbErr;
        }

        // 6.5. Send read receipt (blue tick) and start typing indicator while AI processes
        try {
            await whatsappService.markAsReadAndTyping(messageId, phoneId);
        } catch (statusErr) {
            console.warn('[Webhook Warning] Failed to trigger read receipt or typing indicator:', statusErr.message);
        }

        // 7. Forward incoming message to WIRA Brain (/whatsapp-to-wira)
        let wiraResponse;
        try {
            console.log(`[WIRA Brain] Forwarding incoming WhatsApp message from ${fromPhone}...`);
            wiraResponse = await wiraService.sendToWiraBrain({
                phone: fromPhone,
                whatsappPayload: msg,
                whatsappId: messageId,
                content: messageText,
                files: mediaInfo ? [mediaInfo] : [],
                metadata: { phoneId }
            });
            console.log(`[WIRA Brain Response] Content for ${fromPhone}: "${wiraResponse?.data?.content || wiraResponse?.content || ''}"`);
        } catch (wiraErr) {
            console.warn(`[Webhook WIRA Brain Warning] ${wiraErr.message}. Attempting fallback to chatbot session...`);
            try {
                let activeSession = await sessionModel.findActiveSession(fromPhone);
                let sessionId = activeSession?.session_id;

                if (!sessionId) {
                    console.log(`[WIRA Fallback] No active session for ${fromPhone}. Initializing new session...`);
                    const startRes = await wiraService.startChatbot(env.WIRA_WEB_NAME);
                    if (startRes && startRes.id) {
                        sessionId = startRes.id;
                        await sessionModel.saveSession(fromPhone, sessionId, env.WIRA_WEB_NAME);
                        wiraResponse = startRes;
                    }
                }

                if (sessionId) {
                    try {
                        console.log(`[WIRA Fallback] Sending query to session ${sessionId} for ${fromPhone}...`);
                        wiraResponse = await wiraService.replyChatbot(sessionId, messageText);
                    } catch (replyErr) {
                        console.warn(`[WIRA Fallback] Session ${sessionId} reply failed (${replyErr.message}). Restarting fresh session...`);
                        const startRes = await wiraService.startChatbot(env.WIRA_WEB_NAME);
                        if (startRes && startRes.id) {
                            const newSessionId = startRes.id;
                            await sessionModel.saveSession(fromPhone, newSessionId, env.WIRA_WEB_NAME);
                            wiraResponse = await wiraService.replyChatbot(newSessionId, messageText);
                        } else {
                            throw replyErr;
                        }
                    }
                }
            } catch (fallbackErr) {
                console.error('[Webhook Fallback Error] Unable to complete fallback reply:', fallbackErr.message);
                throw wiraErr;
            }
        }

        // 8. Send response back to the WhatsApp user (Interactive Buttons/List if options exist)
        const responseData = wiraResponse?.data || wiraResponse || {};
        const optionsList = responseData?.options;
        const hasOptions = Array.isArray(optionsList) && optionsList.filter(o => o && typeof o === 'string' && o.trim() !== '').length > 0;

        let formattedReply;
        let metaRes;
        let outgoingMsgType = 'text';

        if (hasOptions) {
            // Format main text WITHOUT duplicating options inside text body
            formattedReply = whatsappService.formatWiraResponse(responseData, false);
            
            try {
                // If main body text is very long (> 1000 chars), send body text first, then send options button/list
                if (formattedReply.length > 1000) {
                    await whatsappService.sendTextMessage(fromPhone, formattedReply, phoneId);
                    console.log(`[WhatsApp] Sent long text body, now sending interactive options to ${fromPhone}...`);
                    metaRes = await whatsappService.sendInteractiveMessage(fromPhone, "Please choose an option below:", optionsList, phoneId);
                } else {
                    metaRes = await whatsappService.sendInteractiveMessage(fromPhone, formattedReply, optionsList, phoneId);
                }
                outgoingMsgType = 'interactive';
            } catch (interactiveErr) {
                console.warn(`[Webhook Error] Failed to send interactive message (${interactiveErr.message}). Falling back to text message.`);
                formattedReply = whatsappService.formatWiraResponse(responseData, true);
                metaRes = await whatsappService.sendTextMessage(fromPhone, formattedReply, phoneId);
            }
        } else {
            formattedReply = whatsappService.formatWiraResponse(responseData, true);
            console.log(`[WhatsApp] Sending reply to ${fromPhone}: "${formattedReply.replace(/\n/g, ' ')}"`);
            metaRes = await whatsappService.sendTextMessage(fromPhone, formattedReply, phoneId);
        }
        
        // 9. Extract Meta outgoing message ID
        const outgoingMessageId = metaRes?.messages?.[0]?.id || `out_${messageId}`;
        console.log(`[WhatsApp] Message sent (${outgoingMsgType}): ${outgoingMessageId}`);

        // 10. Log outgoing message
        await messageLogModel.logMessage({
            whatsappNumber: fromPhone,
            messageId: outgoingMessageId,
            direction: 'outgoing',
            messageType: outgoingMsgType,
            messageText: formattedReply,
            rawPayload: metaRes || {}
        });

        // 11. Check if the session is terminated
        const isTerminated = responseData?.terminated === true || wiraResponse?.terminated === true;
        if (isTerminated) {
            console.log(`[Webhook] WIRA response flagged session termination for ${fromPhone}. Terminating...`);
            await sessionModel.terminateSession(fromPhone);
        }

        console.log(`[Webhook] Finished processing incoming message ${messageId}. Reply sent.`);

    } catch (error) {
        console.error('[Webhook Error]', error.message);
    }
};

/**
 * Handle Meta webhook POST messages receiver
 */
const receiveWebhook = (req, res) => {
    try {
        console.log('[Webhook] Raw POST received');
        console.log('[Webhook Raw Hit]', JSON.stringify(req.body, null, 2));

        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            // Respond 200 immediately to Meta to prevent retries
            res.status(200).send('EVENT_RECEIVED');

            // Trigger background processing asynchronously after response is sent
            setImmediate(() => {
                processIncomingMessage(body).catch((err) => {
                    console.error('[Webhook Async Background Error]', err.message);
                });
            });
        } else {
            console.warn('[Webhook Warning] Unknown object type received:', body.object);
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('[Webhook POST Error]', error.message);
        if (!res.headersSent) {
            res.status(500).send(error.message);
        }
    }
};

/**
 * Direct API endpoint for WIRA Brain to hit and trigger WhatsApp messages (/wira-hit-msg)
 */
const wiraHitMsg = async (req, res) => {
    try {
        console.log('[WIRA Hit Msg API] Incoming request payload:', JSON.stringify(req.body, null, 2));

        const bodyData = req.body.data || {};
        const recipientPhone = bodyData.phone || req.body.phone;
        const innerPayload = bodyData.data || bodyData || req.body;
        const phoneId = req.body.phoneId || env.WHATSAPP_PHONE_NUMBER_ID;

        if (!recipientPhone) {
            return res.status(400).json({
                statusCode: 400,
                success: false,
                message: "Error sending message: 'phone' (recipient number) is required.",
                data: null
            });
        }

        const optionsList = innerPayload?.options;
        const hasOptions = Array.isArray(optionsList) && optionsList.filter(o => o && typeof o === 'string' && o.trim() !== '').length > 0;

        let formattedReply;
        let metaRes;
        let outgoingMsgType = 'text';

        if (hasOptions) {
            formattedReply = whatsappService.formatWiraResponse(innerPayload, false);
            try {
                if (formattedReply.length > 1000) {
                    await whatsappService.sendTextMessage(recipientPhone, formattedReply, phoneId);
                    metaRes = await whatsappService.sendInteractiveMessage(recipientPhone, "Please choose an option below:", optionsList, phoneId);
                } else {
                    metaRes = await whatsappService.sendInteractiveMessage(recipientPhone, formattedReply, optionsList, phoneId);
                }
                outgoingMsgType = 'interactive';
            } catch (interactiveErr) {
                console.warn(`[WIRA Hit Msg Error] Failed interactive send (${interactiveErr.message}), falling back to text message.`);
                formattedReply = whatsappService.formatWiraResponse(innerPayload, true);
                metaRes = await whatsappService.sendTextMessage(recipientPhone, formattedReply, phoneId);
            }
        } else {
            formattedReply = whatsappService.formatWiraResponse(innerPayload, true);
            console.log(`[WIRA Hit Msg] Sending message to ${recipientPhone}: "${formattedReply.replace(/\n/g, ' ')}"`);
            metaRes = await whatsappService.sendTextMessage(recipientPhone, formattedReply, phoneId);
        }

        const outgoingMessageId = metaRes?.messages?.[0]?.id || `wira_hit_${Date.now()}`;

        // Log outgoing message to DB
        await messageLogModel.logMessage({
            whatsappNumber: recipientPhone,
            messageId: outgoingMessageId,
            direction: 'outgoing',
            messageType: outgoingMsgType,
            messageText: formattedReply,
            rawPayload: metaRes || {}
        }).catch(err => console.error('[WIRA Hit Msg DB Log Error]', err.message));

        return res.status(200).json({
            statusCode: 200,
            success: true,
            message: "Whatsapp message sent successfully",
            data: {
                phone: recipientPhone,
                messageId: outgoingMessageId,
                metaResponse: metaRes
            }
        });

    } catch (error) {
        console.error('[WIRA Hit Msg Error]', error.message);
        return res.status(500).json({
            statusCode: 500,
            success: false,
            message: error.message || "Error sending message to whatsapp user.",
            data: null
        });
    }
};

/**
 * Direct API to send a WhatsApp text message to any recipient phone number
 */
const sendDirectMessage = async (req, res) => {
    try {
        const { to, message, phoneId } = req.body;

        if (!to || !message) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: 'to' (phone number) and 'message' (text content) are required."
            });
        }

        console.log(`[Send Direct API] Request to send message to ${to}`);
        const result = await whatsappService.sendTextMessage(to, message, phoneId);

        // Log outgoing message to DB
        const outgoingMessageId = result?.messages?.[0]?.id || `direct_${Date.now()}`;
        await messageLogModel.logMessage({
            whatsappNumber: to,
            messageId: outgoingMessageId,
            direction: 'outgoing',
            messageType: 'text',
            messageText: message,
            rawPayload: result || {}
        }).catch(err => console.error('[Send Direct API DB Log Error]', err.message));

        return res.status(200).json({
            success: true,
            message: 'WhatsApp message sent successfully.',
            data: {
                to,
                messageId: outgoingMessageId,
                metaResponse: result
            }
        });
    } catch (error) {
        console.error('[Send Direct API Error]', error.message);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to send WhatsApp message.'
        });
    }
};

module.exports = {
    verifyWebhook,
    receiveWebhook,
    wiraHitMsg,
    sendDirectMessage
};

