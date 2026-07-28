const axios = require('axios');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

/**
 * Format WIRA AI response data to WhatsApp-friendly message text
 * @param {object} data The response data from WIRA
 * @param {boolean} [includeOptionsText=true] Whether to append options as text lines
 * @returns {string} Formatted text
 */
const formatWiraResponse = (data, includeOptionsText = true) => {
    console.log("Line10 whatsapp.services.js", data, "wira response data,", data?.jobs);
    if (!data) {
        return 'How can I help you today?';
    }

    let text = data.content || '';
    text = text.trim();
    if (!text) {
        text = 'How can I help you today?'; // Fallback message
    }

    if (includeOptionsText && data.options && Array.isArray(data.options) && data.options.length > 0) {
        text += '\n\n*Options:*';
        data.options.forEach((opt, idx) => {
            text += `\n${idx + 1}. ${opt}`;
        });
    }

    if (data.links && Array.isArray(data.links) && data.links.length > 0) {
        text += '\n\n*Links:*';
        data.links.forEach((link) => {
            text += `\n${link}`;
        });
    }

    if (data.jobs && Array.isArray(data.jobs) && data.jobs.length > 0) {
        text += '\n\n*Jobs:*';
        const topJobs = data.jobs.slice(0, 5);
        topJobs.forEach((job, idx) => {
            const title = job.position_name || job.title || job.jobTitle || job.name || 'Job';
            const company = job.clientname || job.company;
            const location = job.city || job.locations || job.jobLocation || job.location || 'Remote';
            
            // Build the job header
            let jobText = `\n\n${idx + 1}. *${title}*`;
            if (company) {
                jobText += ` at *${company}*`;
            }
            
            // Location
            jobText += `\n📍 *Location:* ${location}`;
            
            // Experience
            const minExp = job.min_year_exp;
            const maxExp = job.max_year_exp;
            if (minExp !== undefined && minExp !== null && maxExp !== undefined && maxExp !== null) {
                jobText += `\n💼 *Experience:* ${minExp}-${maxExp} Years`;
            } else if (minExp !== undefined && minExp !== null) {
                jobText += `\n💼 *Experience:* ${minExp}+ Years`;
            } else if (maxExp !== undefined && maxExp !== null) {
                jobText += `\n💼 *Experience:* Up to ${maxExp} Years`;
            }
            
            // Skills
            if (job.skill_set) {
                jobText += `\n🛠️ *Skills:* ${job.skill_set}`;
            }
            
            // Salary
            const formatSalary = (val) => {
                if (val === null || val === undefined || val === '') return '';
                const num = Number(val);
                return isNaN(num) ? val : num.toLocaleString('en-IN');
            };
            const minSal = formatSalary(job.min_salary);
            const maxSal = formatSalary(job.max_salary);
            const salType = job.salary_type || '';
            const payType = job.pay_type || '';
            
            if (minSal || maxSal) {
                let salLine = `\n💰 *Salary:* `;
                if (minSal && maxSal) {
                    salLine += `${minSal} - ${maxSal}`;
                } else {
                    salLine += minSal || maxSal;
                }
                if (salType) salLine += ` ${salType}`;
                if (payType) salLine += ` ${payType}`;
                jobText += salLine.trimEnd();
            }
            
            // Contact
            const contactName = job.contact_person_name;
            const contactPhone = job.person_contact;
            const contactEmail = job.person_email;
            const contactInfo = [];
            if (contactPhone) contactInfo.push(contactPhone);
            if (contactEmail) contactInfo.push(contactEmail);
            
            if (contactName || contactInfo.length > 0) {
                let contactLine = `\n📞 *Contact:* `;
                if (contactName) {
                    contactLine += contactName;
                    if (contactInfo.length > 0) {
                        contactLine += ` (${contactInfo.join(' / ')})`;
                    }
                } else {
                    contactLine += contactInfo.join(' / ');
                }
                jobText += contactLine;
            }
            
            text += jobText;
        });
    }

    // Limit to WhatsApp character limit (4096)
    if (text.length > 4096) {
        text = text.substring(0, 4093) + '...';
    }

    return text;
};

/**
 * Send text message using Meta Cloud API
 * @param {string} toPhoneNumber Recipient phone number (wa_id)
 * @param {string} messageBody Text content of message
 * @param {string} [customPhoneNumberId] Webhook-sourced phone number ID
 * @returns {Promise<object>} Meta API response data
 */
const sendTextMessage = async (toPhoneNumber, messageBody, customPhoneNumberId = null) => {
    const phoneId = customPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
    const token = env.WHATSAPP_ACCESS_TOKEN;
    const version = env.WHATSAPP_API_VERSION;

    if (!phoneId) {
        throw new Error('WhatsApp Phone Number ID is missing.');
    }
    if (!token || token === 'placeholder_access_token_here') {
        throw new Error('WhatsApp Access Token is missing or placeholder.');
    }

    const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

    try {
        console.log(`[WhatsApp Service] Sending message to ${toPhoneNumber} using Phone ID: ${phoneId}...`);
        const response = await axios.post(url, {
            messaging_product: 'whatsapp',
            to: toPhoneNumber,
            type: 'text',
            text: {
                body: messageBody
            }
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        // Secure logging to prevent leakage of accessToken which is in headers
        const statusCode = error.response?.status;
        const errorDetails = error.response?.data?.error;
        console.error(`[WhatsApp Service Error] Failed to send message. HTTP Status: ${statusCode || 'N/A'}. Code: ${errorDetails?.code || 'N/A'}. Message: ${errorDetails?.message || error.message}`);
        
        throw new Error(errorDetails?.message || error.message);
    }
};

/**
 * Helper to truncate text at word boundary without adding trailing '...'
 */
const getCleanTitle = (text, maxLen = 24) => {
    const trimmed = (text || '').trim();
    if (trimmed.length <= maxLen) return trimmed;
    const sub = trimmed.substring(0, maxLen);
    const lastSpace = sub.lastIndexOf(' ');
    if (lastSpace > 8) {
        return sub.substring(0, lastSpace).trim();
    }
    return sub.trim();
};

/**
 * Send interactive button or list message using Meta Cloud API
 * @param {string} toPhoneNumber Recipient phone number (wa_id)
 * @param {string} bodyText Main text content for the interactive message (max 1024 chars)
 * @param {Array<string>} options List of options
 * @param {string} [customPhoneNumberId] Webhook-sourced phone number ID
 * @returns {Promise<object>} Meta API response data
 */
const sendInteractiveMessage = async (toPhoneNumber, bodyText, options, customPhoneNumberId = null) => {
    const phoneId = customPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
    const token = env.WHATSAPP_ACCESS_TOKEN;
    const version = env.WHATSAPP_API_VERSION;

    if (!phoneId) {
        throw new Error('WhatsApp Phone Number ID is missing.');
    }
    if (!token || token === 'placeholder_access_token_here') {
        throw new Error('WhatsApp Access Token is missing or placeholder.');
    }

    const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

    const textBody = (bodyText || 'Please select an option below:').trim().substring(0, 1000);
    const validOptions = (options || []).filter(opt => opt && typeof opt === 'string' && opt.trim() !== '');

    if (validOptions.length === 0) {
        return sendTextMessage(toPhoneNumber, textBody, customPhoneNumberId);
    }

    // Decide between quick reply buttons (<= 3 options and title <= 20 chars) vs list (4 to 10 options or long titles)
    const canUseButtons = validOptions.length <= 3 && validOptions.every(opt => opt.trim().length <= 20);

    let interactivePayload;

    if (canUseButtons) {
        // Quick Reply Buttons (Max 3 buttons)
        const buttons = validOptions.map((opt, idx) => {
            const cleanOpt = opt.trim();
            return {
                type: 'reply',
                reply: {
                    id: cleanOpt.substring(0, 200),
                    title: cleanOpt.substring(0, 20)
                }
            };
        });

        interactivePayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: toPhoneNumber,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: textBody
                },
                action: {
                    buttons: buttons
                }
            }
        };
    } else {
        // List Message (Up to 10 rows)
        const rows = validOptions.slice(0, 10).map((opt, idx) => {
            const cleanOpt = opt.trim();
            const rowTitle = cleanOpt.length > 24 ? cleanOpt.substring(0, 24) : cleanOpt;

            return {
                id: cleanOpt.substring(0, 200),
                title: rowTitle
            };
        });

        interactivePayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: toPhoneNumber,
            type: 'interactive',
            interactive: {
                type: 'list',
                body: {
                    text: textBody
                },
                action: {
                    button: 'Select Option',
                    sections: [
                        {
                            title: 'Options',
                            rows: rows
                        }
                    ]
                }
            }
        };
    }

    try {
        console.log(`[WhatsApp Service] Sending interactive ${canUseButtons ? 'button' : 'list'} message to ${toPhoneNumber}...`);
        const response = await axios.post(url, interactivePayload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        const statusCode = error.response?.status;
        const errorDetails = error.response?.data?.error;
        console.error(`[WhatsApp Service Error] Failed to send interactive message. HTTP Status: ${statusCode || 'N/A'}. Code: ${errorDetails?.code || 'N/A'}. Message: ${errorDetails?.message || error.message}`);

        throw new Error(errorDetails?.message || error.message);
    }
};

const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/amr': 'amr',
    'audio/aac': 'aac'
};

/**
 * Downloads a media file from WhatsApp Meta Cloud API and saves it locally
 * @param {string} mediaId 
 * @param {string|null} originalFilename 
 * @returns {Promise<object>} File information
 */
const downloadWhatsAppMedia = async (mediaId, originalFilename = null) => {
    // Support testing mode with mock media IDs
    if (mediaId && mediaId.startsWith('test_')) {
        console.log(`[WhatsApp Service] Simulating download for mock media ID: ${mediaId}`);
        let mimeType = 'application/pdf';
        if (mediaId.includes('image')) {
            mimeType = 'image/jpeg';
        } else if (mediaId.includes('audio') || mediaId.includes('voice')) {
            mimeType = 'audio/ogg; codecs=opus';
        }
        const ext = mimeToExt[mimeType] || 'bin';
        let savedFilename = originalFilename || `mock_${Date.now()}.${ext}`;
        if (originalFilename) {
            savedFilename = `${Date.now()}_${savedFilename.replace(/\s+/g, '_')}`;
        }
        
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        const savePath = path.join(uploadsDir, savedFilename);
        
        await fs.promises.writeFile(savePath, `Mock content for media ID: ${mediaId}`);
        console.log(`[WhatsApp Service] Mock media saved successfully at ${savePath}`);
        
        return {
            filename: savedFilename,
            mimeType: mimeType,
            relativePath: `/uploads/${savedFilename}`
        };
    }

    const token = env.WHATSAPP_ACCESS_TOKEN;
    const version = env.WHATSAPP_API_VERSION;
    
    if (!token || token === 'placeholder_access_token_here') {
        throw new Error('WhatsApp Access Token is missing or placeholder.');
    }

    // 1. Get media metadata URL from Meta API
    const metadataUrl = `https://graph.facebook.com/${version}/${mediaId}`;
    console.log(`[WhatsApp Service] Fetching media metadata for ID: ${mediaId}...`);
    
    const metaResponse = await axios.get(metadataUrl, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const downloadUrl = metaResponse.data.url;
    const mimeType = metaResponse.data.mime_type;

    if (!downloadUrl) {
        throw new Error(`Failed to retrieve download URL for media ID: ${mediaId}`);
    }

    // 2. Download media file
    console.log(`[WhatsApp Service] Downloading media from: ${downloadUrl}`);
    const fileResponse = await axios.get(downloadUrl, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        responseType: 'arraybuffer'
    });

    // 3. Determine filename
    let savedFilename = originalFilename;
    if (!savedFilename) {
        const ext = mimeToExt[mimeType] || mimeType.split('/')[1] || 'bin';
        savedFilename = `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
    } else {
        // Prepend a timestamp and sanitize spaces to prevent conflicts
        savedFilename = `${Date.now()}_${savedFilename.replace(/\s+/g, '_')}`;
    }

    const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
    const savePath = path.join(uploadsDir, savedFilename);

    // 4. Save to disk
    await fs.promises.writeFile(savePath, fileResponse.data);
    console.log(`[WhatsApp Service] Media saved successfully at ${savePath}`);

    return {
        filename: savedFilename,
        mimeType: mimeType,
        relativePath: `/uploads/${savedFilename}`
    };
};

module.exports = {
    formatWiraResponse,
    sendTextMessage,
    sendInteractiveMessage,
    downloadWhatsAppMedia
};

