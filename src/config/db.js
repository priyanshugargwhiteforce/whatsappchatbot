const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool(env.database);

const initSchema = async () => {
    try {
        console.log('[DB] Checking/initializing database schema...');

        // 1. Sessions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS wira_whatsapp_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                whatsapp_number VARCHAR(50) NOT NULL UNIQUE,
                session_id VARCHAR(255) NOT NULL,
                web_name VARCHAR(255) NOT NULL,
                language VARCHAR(50) DEFAULT 'en',
                \`terminated\` TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[DB] - wira_whatsapp_sessions table verified/created');

        // 2. Message logs table with UNIQUE on message_id
        await pool.query(`
            CREATE TABLE IF NOT EXISTS wira_whatsapp_message_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                whatsapp_number VARCHAR(50) NOT NULL,
                message_id VARCHAR(255) NOT NULL UNIQUE,
                direction ENUM('incoming', 'outgoing') NOT NULL,
                message_type VARCHAR(50) NOT NULL,
                message_text TEXT,
                raw_payload JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[DB] - wira_whatsapp_message_logs table verified/created');

    } catch (error) {
        console.error('[DB] Schema initialization error:', error.message);
        throw error;
    }
};

const connectDB = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('[DB] Connected to MySQL Database successfully');
        connection.release();

        await initSchema();
    } catch (error) {
        console.error('[DB] Connection failed:', error.message);
        process.exit(1);
    }
};

module.exports = {
    pool,
    connectDB
};
