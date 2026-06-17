const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const requiredEnv = [
    'META_VERIFY_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME'
];

// Verify required variables
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.warn(`[WARNING] Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
    PORT: parseInt(process.env.PORT || '8001', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v20.0',
    WIRA_BASE_URL: process.env.WIRA_BASE_URL || 'https://astro-buddy.in/AI',
    WIRA_WEB_NAME: process.env.WIRA_WEB_NAME || 'White Force',
    database: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'app_user',
        password: process.env.DB_PASSWORD || 'App@123456',
        database: process.env.DB_NAME || 'wira_whatsapp_chatbot',
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0
    }
};
