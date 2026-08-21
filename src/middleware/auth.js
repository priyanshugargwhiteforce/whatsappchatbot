const env = require('../config/env');

/**
 * Middleware to validate incoming forwarded webhooks from WF Ad Manager.
 */
const validateForwardedWebhook = (req, res, next) => {
    const incomingSecret = req.headers['x-wira-internal-secret'] || req.headers['x-api-key'];

    // 1. If internal secret header is provided, validate it
    if (incomingSecret) {
        const validKeys = [env.WIRA_INTERNAL_SECRET, env.WIRA_BRAIN_API_KEY].filter(Boolean);
        if (validKeys.length > 0 && !validKeys.includes(incomingSecret)) {
            console.warn(`[Unauthorized Webhook] Access denied for IP: ${req.ip}`);
            return res.status(401).json({ 
                success: false, 
                message: 'Unauthorized: Invalid internal webhook secret.' 
            });
        }
        return next();
    }

    // 2. Direct Meta Cloud API webhooks or dev mode (no secret header present)
    const body = req.body || {};
    if (body.object === "whatsapp_business_account" || Array.isArray(body.entry) || body.entry || env.NODE_ENV !== 'production') {
        return next();
    }

    // 3. Fallback: Allow incoming webhooks to ensure message delivery is never blocked
    next();
};

/**
 * Middleware to validate x-api-key header for incoming WIRA Brain calls (e.g. /wira-hit-msg)
 */
const validateApiKey = (req, res, next) => {
    const incomingApiKey = req.headers['x-api-key'] || req.headers['x-wira-internal-secret'] || req.query.apiKey;

    // In development mode, allow testing if key is not provided
    if (env.NODE_ENV !== 'production' && !incomingApiKey) {
        return next();
    }

    const validKeys = [env.WIRA_INTERNAL_SECRET, env.WIRA_BRAIN_API_KEY].filter(Boolean);
    if (!incomingApiKey || (validKeys.length > 0 && !validKeys.includes(incomingApiKey))) {
        console.warn(`[Unauthorized API Request] Invalid x-api-key from IP: ${req.ip}`);
        return res.status(401).json({
            statusCode: 401,
            success: false,
            message: 'Unauthorized: Invalid or missing x-api-key header.'
        });
    }

    next();
};

module.exports = { 
    validateForwardedWebhook,
    validateApiKey
};
