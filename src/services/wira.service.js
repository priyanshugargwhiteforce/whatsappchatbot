const axios = require('axios');
const env = require('../config/env');

/**
 * Initialize chatbot session with WIRA AI
 * @param {string} webName The web name (e.g. 'White Force')
 * @returns {Promise<object>} The WIRA API response
 */
const startChatbot = async (webName = env.WIRA_WEB_NAME) => {
    try {
        const url = `${env.WIRA_BASE_URL}/start-chatbot`;
        console.log(`[WIRA Service] Initializing chatbot session with ${webName}...`);
        
        const response = await axios.post(url, {
            webName
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;
    } catch (error) {
        console.error('[WIRA Service] startChatbot API error:', error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
};

/**
 * Send reply/query to WIRA AI chatbot session
 * @param {string} sessionId Active session ID
 * @param {string} content User message text
 * @returns {Promise<object>} The WIRA API response
 */
const replyChatbot = async (sessionId, content) => {
    try {
        const url = `${env.WIRA_BASE_URL}/reply-chatbot`;
        console.log(`[WIRA Service] Sending reply query to session ${sessionId}...`);

        const response = await axios.post(url, {
            sessionId,
            content
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;
    } catch (error) {
        console.error('[WIRA Service] replyChatbot API error:', error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
};

module.exports = {
    startChatbot,
    replyChatbot
};
