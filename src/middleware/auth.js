const env = require('../config/env');

/**
 * Middleware to validate incoming forwarded webhooks from WF Ad Manager.
 */
const validateForwardedWebhook = (req, res, next) => {
    const incomingSecret = req.headers['x-wira-internal-secret'];
    const expectedSecret = env.WIRA_INTERNAL_SECRET;

    // In development mode, allow testing if secret is not provided
    if (env.NODE_ENV !== 'production' && !incomingSecret) {
        return next();
    }

    // Verify secret
    if (!expectedSecret || incomingSecret !== expectedSecret) {
        console.warn(`[Unauthorized Webhook] Access denied for IP: ${req.ip}`);
        return res.status(401).json({ 
            success: false, 
            message: 'Unauthorized: Invalid internal webhook secret.' 
        });
    }

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
