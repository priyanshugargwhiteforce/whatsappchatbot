const express = require('express');
const cors = require('cors');
const env = require('./src/config/env');
const { connectDB } = require('./src/config/db');

const app = express();

// Middleware config
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'WIRA AI WhatsApp Chatbot MVP API is online.'
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        env: env.NODE_ENV
    });
});

// Mount WhatsApp routing
app.use('/api/whatsapp', require('./src/routes/whatsapp.routes'));

// Global error handler middleware
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]', err.stack);
    
    // Prevent leak of environment tokens in responses
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// Database connection & bootstrap server
const startServer = async () => {
    try {
        // 1. Initialize DB and schema
        await connectDB();

        // 2. Start Express app listening
        const PORT = env.PORT;
        app.listen(PORT, () => {
            console.log(`🚀 Server running in [${env.NODE_ENV}] mode on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Server startup failure:', error.message);
        process.exit(1);
    }
};

startServer();
