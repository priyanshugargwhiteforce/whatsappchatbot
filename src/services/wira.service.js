const axios = require('axios');
const env = require('../config/env');

// Axios client preconfigured for WIRA Brain API calls
const wiraApiClient = axios.create({
    baseURL: env.WIRA_BRAIN_BASE_URL || 'https://astro-buddy.in/AI',
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.WIRA_BRAIN_API_KEY || 'wiraai_api_16072026_X9mQ7vLp2Kf8RsW4YcT6Zn1A'
    }
});

/**
 * Forward user message and metadata from WhatsApp to WIRA Brain (/whatsapp-to-wira)
 * @param {object} payload 
 * @param {string} payload.phone Candidate phone number
 * @param {object} [payload.whatsappPayload] Raw WhatsApp message payload
 * @param {string} [payload.whatsappId] Meta message ID (wamid)
 * @param {string} payload.content User text content or caption
 * @param {Array<string>} [payload.jobIds] Related Job IDs if available
 * @param {Array<object>} [payload.files] Saved file metadata array
 * @param {object} [payload.metadata] Additional contextual metadata
 * @returns {Promise<object>} WIRA Brain response
 */
const sendToWiraBrain = async ({ phone, whatsappPayload = {}, whatsappId = '', content = '', jobIds = [], files = [], metadata = {} }) => {
    try {
        console.log(`[WIRA Service] Forwarding message to WIRA Brain for ${phone}...`);
        
        const requestData = {
            phone,
            whatsappPayload,
            whatsappId,
            content,
            jobIds,
            files,
            metadata,
            role: 'user',
            platform: 'Whatsapp'
        };

        const response = await wiraApiClient.post('/whatsapp-to-wira', requestData);
        console.log(`[WIRA Service] WIRA Brain response received for ${phone}`);
        return response.data;
    } catch (error) {
        console.error('[WIRA Service] sendToWiraBrain API error:', error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
};

/**
 * Upload/save candidate file attachment to WIRA Brain storage (/wira-file-save)
 * @param {Buffer|object} fileBuffer Binary file buffer or metadata object
 * @param {string} filename Original filename
 * @param {string} mimeType MIME type
 * @returns {Promise<object>} Saved file response metadata from WIRA Brain
 */
const saveWiraFile = async ({ fileBuffer, filename, mimeType }) => {
    try {
        console.log(`[WIRA Service] Saving attachment "${filename}" to WIRA Brain...`);

        const requestData = {
            filename,
            mimeType,
            fileData: Buffer.isBuffer(fileBuffer) ? fileBuffer.toString('base64') : fileBuffer
        };

        const response = await wiraApiClient.post('/wira-file-save', requestData);
        return response.data;
    } catch (error) {
        console.error('[WIRA Service] saveWiraFile API error:', error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
};

/**
 * Legacy: Initialize chatbot session with WIRA AI (/start-chatbot)
 * @param {string} webName The web name (e.g. 'White Force')
 * @returns {Promise<object>} The WIRA API response
 */
const startChatbot = async (webName = env.WIRA_WEB_NAME) => {
    try {
        console.log(`[WIRA Service] Initializing legacy chatbot session with ${webName}...`);
        const response = await wiraApiClient.post('/start-chatbot', { webName });
        return response.data;
    } catch (error) {
        console.error('[WIRA Service] startChatbot API error:', error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
};

/**
 * Legacy: Send reply/query to WIRA AI chatbot session (/reply-chatbot)
 * @param {string} sessionId Active session ID
 * @param {string} content User message text
 * @returns {Promise<object>} The WIRA API response
 */
const replyChatbot = async (sessionId, content) => {
    try {
        console.log(`[WIRA Service] Sending legacy reply query to session ${sessionId}...`);
        const response = await wiraApiClient.post('/reply-chatbot', { sessionId, content });
        return response.data;
    } catch (error) {
        console.error('[WIRA Service] replyChatbot API error:', error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
};

module.exports = {
    sendToWiraBrain,
    saveWiraFile,
    startChatbot,
    replyChatbot
};
