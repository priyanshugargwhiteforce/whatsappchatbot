const { pool } = require('../config/db');

/**
 * Log an incoming or outgoing message
 * @param {object} logData 
 * @param {string} logData.whatsappNumber 
 * @param {string} logData.messageId 
 * @param {string} logData.direction 'incoming' | 'outgoing'
 * @param {string} logData.messageType e.g., 'text'
 * @param {string} logData.messageText 
 * @param {object} logData.rawPayload 
 * @returns {Promise<object>} Result metadata
 */
const logMessage = async ({ whatsappNumber, messageId, direction, messageType, messageText, rawPayload }) => {
    try {
        const [result] = await pool.query(
            `INSERT INTO wira_whatsapp_message_logs (whatsapp_number, message_id, direction, message_type, message_text, raw_payload)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [whatsappNumber, messageId, direction, messageType, messageText, JSON.stringify(rawPayload || {})]
        );
        return result;
    } catch (error) {
        console.error('[MessageLog Model] Error in logMessage:', error.message);
        throw error;
    }
};

/**
 * Check if message ID already exists (to prevent duplicates)
 * @param {string} messageId 
 * @returns {Promise<boolean>} True if exists, else false
 */
const isDuplicateMessage = async (messageId) => {
    try {
        if (!messageId) return false;
        const [rows] = await pool.query(
            'SELECT id FROM wira_whatsapp_message_logs WHERE message_id = ? LIMIT 1',
            [messageId]
        );
        return rows.length > 0;
    } catch (error) {
        console.error('[MessageLog Model] Error in isDuplicateMessage:', error.message);
        throw error;
    }
};

/**
 * Clear sessions and message logs for development testing
 * @returns {Promise<void>}
 */
const clearLogsAndSessions = async () => {
    try {
        // DELETE statements (safe, not dropping tables)
        await pool.query('DELETE FROM wira_whatsapp_message_logs');
        await pool.query('DELETE FROM wira_whatsapp_sessions');
        console.log('[MessageLog Model] Cleared message logs and sessions successfully.');
    } catch (error) {
        console.error('[MessageLog Model] Error in clearLogsAndSessions:', error.message);
        throw error;
    }
};

module.exports = {
    logMessage,
    isDuplicateMessage,
    clearLogsAndSessions
};
