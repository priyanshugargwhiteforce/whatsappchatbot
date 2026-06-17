const { pool } = require('../config/db');

/**
 * Find active session for a given WhatsApp number
 * @param {string} whatsappNumber 
 * @returns {Promise<object|null>} Session object or null
 */
const findActiveSession = async (whatsappNumber) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, whatsapp_number, session_id, web_name, language, `terminated` FROM wira_whatsapp_sessions WHERE whatsapp_number = ? AND `terminated` = 0',
            [whatsappNumber]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('[Session Model] Error in findActiveSession:', error.message);
        throw error;
    }
};

/**
 * Create or update session for a given WhatsApp number
 * @param {string} whatsappNumber 
 * @param {string} sessionId 
 * @param {string} webName 
 * @returns {Promise<object>} Result metadata
 */
const saveSession = async (whatsappNumber, sessionId, webName) => {
    try {
        const [result] = await pool.query(
            `INSERT INTO wira_whatsapp_sessions (whatsapp_number, session_id, web_name, \`terminated\`)
             VALUES (?, ?, ?, 0)
             ON DUPLICATE KEY UPDATE
                session_id = VALUES(session_id),
                web_name = VALUES(web_name),
                \`terminated\` = 0`,
            [whatsappNumber, sessionId, webName]
        );
        return result;
    } catch (error) {
        console.error('[Session Model] Error in saveSession:', error.message);
        throw error;
    }
};

/**
 * Terminate a session for a given WhatsApp number
 * @param {string} whatsappNumber 
 * @returns {Promise<object>} Result metadata
 */
const terminateSession = async (whatsappNumber) => {
    try {
        const [result] = await pool.query(
            'UPDATE wira_whatsapp_sessions SET `terminated` = 1 WHERE whatsapp_number = ?',
            [whatsappNumber]
        );
        return result;
    } catch (error) {
        console.error('[Session Model] Error in terminateSession:', error.message);
        throw error;
    }
};

module.exports = {
    findActiveSession,
    saveSession,
    terminateSession
};
