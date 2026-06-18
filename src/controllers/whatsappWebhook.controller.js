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

        // 3. Process only text messages for MVP
        if (msg.type !== 'text' || !msg.text?.body) {
            console.log(`[Webhook] Ignoring non-text message type: ${msg.type}`);
            return;
        }

        // 4. Extract variables
        const fromPhone = msg.from || value.contacts?.[0]?.wa_id;
        const messageText = msg.text.body;
        const messageId = msg.id;
        const phoneId = value.metadata?.phone_number_id || env.WHATSAPP_PHONE_NUMBER_ID;

        if (!fromPhone || !messageId) {
            console.warn('[Webhook Error] Missing recipient number (from) or message ID in payload.');
            return;
        }

        console.log(`[Webhook] Parsed text message from ${fromPhone}: ${messageText}`);

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
                messageType: 'text',
                messageText: messageText,
                rawPayload: msg
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
                const isGreeting = /^(hi|hello|hey|hola|start|get started|hii|helo)$/i.test(messageText.trim());
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

        // 8. Convert WIRA response to WhatsApp-friendly text
        const formattedReply = whatsappService.formatWiraResponse(wiraResponse.data);

        // 9. Send response back to the same WhatsApp user
        console.log(`[WhatsApp] Sending reply to ${fromPhone}: "${formattedReply.replace(/\n/g, ' ')}"`);
        const metaRes = await whatsappService.sendTextMessage(fromPhone, formattedReply, phoneId);
        
        // 10. Extract Meta outgoing message ID if available, otherwise construct one
        const outgoingMessageId = metaRes?.messages?.[0]?.id || `out_${messageId}`;
        console.log(`[WhatsApp] Message sent: ${outgoingMessageId}`);

        // 11. Log outgoing message
        await messageLogModel.logMessage({
            whatsappNumber: fromPhone,
            messageId: outgoingMessageId,
            direction: 'outgoing',
            messageType: 'text',
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

module.exports = {
    verifyWebhook,
    receiveWebhook
};
