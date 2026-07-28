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
                messageText = interactive.button_reply?.title || '';
            } else if (interactive?.type === 'list_reply') {
                const listReply = interactive.list_reply;
                const replyId = listReply?.id || '';
                // Prefer id (which holds the full untruncated option text up to 200 chars) over truncated title
                if (replyId && !replyId.startsWith('opt_')) {
                    messageText = replyId;
                } else {
                    messageText = listReply?.description || listReply?.title || replyId || '';
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

        // 7. Check whether this WhatsApp number already has a WIRA session
        let activeSession = await sessionModel.findActiveSession(fromPhone);
        let wiraResponse;

        if (!activeSession) {
            console.log(`[WIRA] Starting session for ${fromPhone}`);
            wiraResponse = await wiraService.startChatbot(env.WIRA_WEB_NAME);
            console.log(`[WIRA Response] startChatbot response content: "${wiraResponse?.data?.content}"`);
            if (wiraResponse && wiraResponse.success && wiraResponse.id) {
                const newSessionId = wiraResponse.id;
                console.log(`[Webhook] Created new WIRA session ${newSessionId} for ${fromPhone}`);
                await sessionModel.saveSession(fromPhone, newSessionId, env.WIRA_WEB_NAME);

                // If first message is a query (not a basic greeting), reply immediately
                const isGreeting = /^(hi|hello|hey|hola|start|get started|hii|helo|hlo)$/i.test(messageText.trim());
                if (!isGreeting) {
                    console.log(`[WIRA] First message is a query ("${messageText}"). Replying immediately in new session...`);
                    wiraResponse = await wiraService.replyChatbot(newSessionId, messageText);
                    console.log(`[WIRA Response] replyChatbot response content: "${wiraResponse?.data?.content}"`);
                }
            } else {
                throw new Error(wiraResponse?.message || 'Failed to start WIRA chatbot session.');
            }
        } else {
            console.log(`[WIRA] Replying session ${activeSession.session_id} for ${fromPhone}`);
            try {
                wiraResponse = await wiraService.replyChatbot(activeSession.session_id, messageText);
                console.log(`[WIRA Response] replyChatbot response content: "${wiraResponse?.data?.content}"`);
            } catch (replyError) {
                console.warn(`[Webhook] WIRA session reply failed: ${replyError.message}. Restarting session.`);
                
                // Fallback: If session expired or was rejected, start a new chatbot session dynamically
                console.log(`[WIRA] Starting session (fallback) for ${fromPhone}`);
                wiraResponse = await wiraService.startChatbot(env.WIRA_WEB_NAME);
                console.log(`[WIRA Response] Fallback startChatbot response content: "${wiraResponse?.data?.content}"`);
                if (wiraResponse && wiraResponse.success && wiraResponse.id) {
                    const newSessionId = wiraResponse.id;
                    await sessionModel.saveSession(fromPhone, newSessionId, env.WIRA_WEB_NAME);

                    const isGreeting = /^(hi|hello|hey|hola|start|get started|hii|helo)$/i.test(messageText.trim());
                    if (!isGreeting) {
                        console.log(`[WIRA] Fallback first message is a query ("${messageText}"). Replying immediately...`);
                        wiraResponse = await wiraService.replyChatbot(newSessionId, messageText);
                        console.log(`[WIRA Response] Fallback replyChatbot response content: "${wiraResponse?.data?.content}"`);
                    }
                } else {
                    throw new Error(wiraResponse?.message || 'Failed to restart WIRA chatbot session.');
                }
            }
        }

        // 8. Send response back to the WhatsApp user (Interactive Buttons/List if options exist)
        const optionsList = wiraResponse.data?.options;
        const hasOptions = Array.isArray(optionsList) && optionsList.filter(o => o && typeof o === 'string' && o.trim() !== '').length > 0;

        let formattedReply;
        let metaRes;
        let outgoingMsgType = 'text';

        if (hasOptions) {
            // Format main text WITHOUT duplicating options inside text body
            formattedReply = whatsappService.formatWiraResponse(wiraResponse.data, false);
            
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
                formattedReply = whatsappService.formatWiraResponse(wiraResponse.data, true);
                metaRes = await whatsappService.sendTextMessage(fromPhone, formattedReply, phoneId);
            }
        } else {
            formattedReply = whatsappService.formatWiraResponse(wiraResponse.data, true);
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

        // 12. Check if the session is terminated
        const isTerminated = wiraResponse.data?.terminated === true || wiraResponse.terminated === true;
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
    sendDirectMessage
};

