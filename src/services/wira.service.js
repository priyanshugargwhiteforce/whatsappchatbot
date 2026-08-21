const axios = require("axios");
const env = require("../config/env");

// Axios client preconfigured for WIRA Brain API calls
const wiraApiClient = axios.create({
  baseURL: env.WIRA_BRAIN_BASE_URL || "https://astro-buddy.in/AI",
  timeout: env.WIRA_API_TIMEOUT_MS || 10000,
  headers: {
    "Content-Type": "application/json",
    "x-api-key":
      env.WIRA_BRAIN_API_KEY || "wiraai_api_16072026_X9mQ7vLp2Kf8RsW4YcT6Zn1A",
  },
});

/**
 * Format phone number to remove country code '91' if phone length is greater than 10 digits
 * @param {string} rawPhone 
 * @returns {string} Clean 10-digit phone number
 */
const formatWiraPhone = (rawPhone) => {
  if (!rawPhone || typeof rawPhone !== "string") return rawPhone || "";
  let clean = rawPhone.trim().replace(/\D/g, "");
  if (clean.length > 10 && clean.startsWith("91")) {
    clean = clean.substring(2);
  }
  return clean;
};

/**
 * Forward user message and metadata from WhatsApp to WIRA Brain (/whatsapp-to-wira)
 * @param {object} payload
 * @param {string} payload.phone Candidate phone number
 * @param {object} [payload.whatsappPayload] Raw WhatsApp message payload
 * @param {string} [payload.whatsappId] Meta message ID (wamid)
 * @param {string} payload.content User text content or caption
 * @param {Array<string>} [payload.jobIds] Related Job IDs if available
 * @param {Array<object>} [payload.files] Saved file metadata array
 * @param {object} [payload.metadata] Additional contextual metadata
 * @returns {Promise<object>} WIRA Brain response
 */
const sendToWiraBrain = async ({
  phone,
  whatsappPayload = {},
  whatsappId = "",
  content = "",
  jobIds = [],
  files = [],
  metadata = null,
  webName = env.WIRA_WEB_NAME || "White Force",
}) => {
  try {
    const cleanPhone = formatWiraPhone(phone);
    console.log(
      `[WIRA Service] Forwarding message to WIRA Brain for ${cleanPhone} (original: ${phone})...`,
    );

    const requestData = {
      role: "user",
      platform: "Whatsapp",
      phone: cleanPhone,
      webName: webName || env.WIRA_WEB_NAME || "White Force",
      content: content || "",
      jobIds: Array.isArray(jobIds) ? jobIds : [],
      metadata: metadata && Object.keys(metadata).length > 0 ? metadata : null,
      files: Array.isArray(files) ? files : [],
      whatsappId: whatsappId || "",
      whatsappPayload: whatsappPayload || {},
    };
    console.log("Request Data For WIRA :> ", JSON.stringify(requestData, null, 2));

    const response = await wiraApiClient.post("/whatsapp-to-wira", requestData);
    console.log(
      `[WIRA Service] WIRA Brain response received for ${cleanPhone}`,
    );
    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    const statusCode = error.response?.status || "N/A";
    console.error(
      `[WIRA Service] sendToWiraBrain API error (Status ${statusCode}):`,
      errorMsg,
    );
    if (error.response?.data) {
      console.error(
        "[WIRA Service Response Data]",
        JSON.stringify(error.response.data),
      );
    }
    throw new Error(errorMsg);
  }
};

/**
 * Upload/save candidate file attachment to WIRA Brain storage (/wira-file-save)
 * @param {Buffer|object} fileBuffer Binary file buffer or metadata object
 * @param {string} filename Original filename
 * @param {string} mimeType MIME type
 * @returns {Promise<object>} Saved file response metadata from WIRA Brain
 */
const saveWiraFile = async ({ fileBuffer, filename, mimeType }) => {
  try {
    console.log(
      `[WIRA Service] Saving attachment "${filename}" to WIRA Brain...`,
    );

    const requestData = {
      filename,
      mimeType,
      fileData: Buffer.isBuffer(fileBuffer)
        ? fileBuffer.toString("base64")
        : fileBuffer,
    };

    const response = await wiraApiClient.post("/wira-file-save", requestData);
    return response.data;
  } catch (error) {
    console.error("[WIRA Service] saveWiraFile API error:", error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

// Old Wira Chat Function For if New Wira Not Response Old are instergrated in Main Chatbot
/**
 * Legacy: Initialize chatbot session with WIRA AI (/start-chatbot)
 * @param {string} webName The web name (e.g. 'White Force')
 * @returns {Promise<object>} The WIRA API response
 */
const startChatbot = async (webName = env.WIRA_WEB_NAME) => {
  try {
    console.log(
      `[WIRA Service] Initializing legacy chatbot session with ${webName}...`,
    );
    const response = await wiraApiClient.post("/start-chatbot", { webName });
    return response.data;
  } catch (error) {
    console.error("[WIRA Service] startChatbot API error:", error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

/**
 * Legacy: Send reply/query to WIRA AI chatbot session (/reply-chatbot)
 * @param {string} sessionId Active session ID
 * @param {string} content User message text
 * @returns {Promise<object>} The WIRA API response
 */
const replyChatbot = async (sessionId, content) => {
  try {
    console.log(
      `[WIRA Service] Sending legacy reply query to session ${sessionId}...`,
    );
    const response = await wiraApiClient.post("/reply-chatbot", {
      sessionId,
      content,
    });
    return response.data;
  } catch (error) {
    console.error("[WIRA Service] replyChatbot API error:", error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

module.exports = {
  formatWiraPhone,
  sendToWiraBrain,
  saveWiraFile,
  startChatbot,
  replyChatbot,
};
