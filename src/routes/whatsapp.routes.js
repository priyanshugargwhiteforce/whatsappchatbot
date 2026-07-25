const express = require('express');
const router = express.Router();
const controller = require('../controllers/whatsappWebhook.controller');
const env = require('../config/env');
const { validateForwardedWebhook } = require('../middleware/auth');

// GET and POST webhooks
router.get('/webhook', controller.verifyWebhook);
router.post('/webhook', validateForwardedWebhook, controller.receiveWebhook);

// Health/debug endpoint for development verification
router.get('/health', (req, res) => {
    // Only return detailed info if not in production to protect credentials info exposure
    if (env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            message: 'Health/debug endpoint is restricted in production.'
        });
    }
    return res.status(200).json({
        status: 'ok',
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        phoneNumberIdConfigured: !!env.WHATSAPP_PHONE_NUMBER_ID,
        hasAccessToken: !!env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_ACCESS_TOKEN !== 'placeholder_access_token_here'
    });
});

// Development testing routes (only when NODE_ENV !== "production")
if (env.NODE_ENV !== 'production') {
    /**
     * POST /api/whatsapp/test/incoming
     * Simulates an incoming text message from Meta Cloud API
     * Acceptable payload body:
     * - Full Meta Webhook JSON
     * - OR simplified JSON: { "from": "919999999999", "text": "Hello WIRA", "name": "Optional Name", "messageId": "optional_id" }
     */
    router.post('/test/incoming', (req, res) => {
        let payload = req.body;

        // If simplified body format is sent, transform it into Meta payload structure
        if (payload.from && (payload.text || payload.type === 'image' || payload.type === 'document' || payload.type === 'audio' || payload.type === 'location')) {
            const mockMsgId = payload.messageId || `test_wamid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            
            let messageObj = {
                from: payload.from,
                id: mockMsgId,
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: payload.type || 'text'
            };

            if (messageObj.type === 'text') {
                messageObj.text = {
                    body: payload.text
                };
            } else if (messageObj.type === 'image') {
                messageObj.image = {
                    id: payload.mediaId || 'test_image_id',
                    mime_type: payload.mimeType || 'image/jpeg',
                    caption: payload.caption || ''
                };
            } else if (messageObj.type === 'document') {
                messageObj.document = {
                    id: payload.mediaId || 'test_document_id',
                    filename: payload.filename || 'resume.pdf',
                    mime_type: payload.mimeType || 'application/pdf',
                    caption: payload.caption || ''
                };
            } else if (messageObj.type === 'audio') {
                messageObj.audio = {
                    id: payload.mediaId || 'test_audio_id',
                    mime_type: payload.mimeType || 'audio/ogg; codecs=opus',
                    voice: payload.voice !== undefined ? payload.voice : true
                };
            } else if (messageObj.type === 'location') {
                messageObj.location = {
                    latitude: payload.latitude || 37.4838726,
                    longitude: payload.longitude || -122.1490044,
                    name: payload.locationName || '',
                    address: payload.locationAddress || ''
                };
            }

            payload = {
                object: 'whatsapp_business_account',
                entry: [
                    {
                        changes: [
                            {
                                value: {
                                    messaging_product: 'whatsapp',
                                    metadata: {
                                        phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID
                                    },
                                    contacts: [
                                        {
                                            profile: { name: payload.name || 'Test User' },
                                            wa_id: payload.from
                                        }
                                    ],
                                    messages: [messageObj]
                                },
                                field: 'messages'
                            }
                        ]
                    }
                ]
            };
        }

        // Replace request body and forward to receiveWebhook
        req.body = payload;
        return controller.receiveWebhook(req, res);
    });

    /**
     * POST /api/whatsapp/test/clear-logs
     * Clears all entries in wira_whatsapp_message_logs and wira_whatsapp_sessions
     */
    router.post('/test/clear-logs', async (req, res) => {
        try {
            const messageLogModel = require('../models/messageLog.model');
            await messageLogModel.clearLogsAndSessions();
            return res.status(200).json({
                success: true,
                message: 'Successfully cleared sessions and message logs in database.'
            });
        } catch (error) {
            console.error('[Test Route] Clear logs error:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to clear database logs',
                error: error.message
            });
        }
    });
} else {
    // Return 403 Forbidden for dev routes if accessed directly in production mode
    router.post('/test/*splat', (req, res) => {
        return res.status(403).json({
            success: false,
            message: 'Test routes are disabled in production environment.'
        });
    });
}

module.exports = router;
