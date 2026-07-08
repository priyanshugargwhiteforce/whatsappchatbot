const env = require('../config/env');

/**
 * Middleware to validate incoming forwarded webhooks from WF Ad Manager.
 */
const validateForwardedWebhook = (req, res, next) => {
    const incomingSecret = req.headers['x-wira-internal-secret'];
    const expectedSecret = env.WIRA_INTERNAL_SECRET;

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

module.exports = { validateForwardedWebhook };
