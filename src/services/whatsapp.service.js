const axios = require('axios');
const env = require('../config/env');

/**
 * Format WIRA AI response data to WhatsApp-friendly message text
 * @param {object} data The response data from WIRA
 * @returns {string} Formatted text
 */
const formatWiraResponse = (data) => {
    console.log("Line10 whatsapp.services.js", data, "wira response data,", data.jobs)
    if (!data) {
        return 'How can I help you today?';
    }

    let text = data.content || '';
    text = text.trim();
    if (!text) {
        text = 'How can I help you today?'; // Fallback message
    }

    if (data.options && Array.isArray(data.options) && data.options.length > 0) {
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

module.exports = {
    formatWiraResponse,
    sendTextMessage
};
