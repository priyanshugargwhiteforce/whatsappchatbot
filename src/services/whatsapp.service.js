const axios = require("axios");
const fs = require("fs");
const path = require("path");
const env = require("../config/env");

/**
 * Helper to generate smart, human-readable label for a URL if none provided
 * @param {string} urlStr
 * @param {number} [fallbackIndex=1]
 * @returns {string} Clean label (max 20 chars for button compatibility)
 */
const getSmartUrlLabel = (urlStr, fallbackIndex = 1) => {
  if (!urlStr || typeof urlStr !== "string") return `Link ${fallbackIndex}`;
  const cleanUrl = urlStr.trim().replace(/[.,;:!)\]}]+$/, "");
  const lowerUrl = cleanUrl.toLowerCase();

  if (lowerUrl.includes("apply")) return "Apply Now";
  if (
    lowerUrl.includes("job") ||
    lowerUrl.includes("career") ||
    lowerUrl.includes("vacancy")
  )
    return "View Job Details";
  if (lowerUrl.includes("resume") || lowerUrl.includes("cv"))
    return "Upload Resume";
  if (lowerUrl.includes("form") || lowerUrl.includes("survey"))
    return "Fill Form";
  if (lowerUrl.includes("contact") || lowerUrl.includes("support"))
    return "Contact Support";

  try {
    const parsed = new URL(cleanUrl);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      const cleanSegment = lastSegment
        .replace(/[-_]/g, " ")
        .replace(/\.\w+$/, "");
      if (cleanSegment.length >= 3 && cleanSegment.length <= 20) {
        return cleanSegment.charAt(0).toUpperCase() + cleanSegment.slice(1);
      }
    }
    const domainName = host.split(".")[0];
    const formattedDomain =
      domainName.charAt(0).toUpperCase() + domainName.slice(1);
    return `Open ${formattedDomain}`.substring(0, 20);
  } catch (e) {
    return `Open Link ${fallbackIndex}`;
  }
};

/**
 * Format WIRA AI response data to WhatsApp-friendly message text
 * @param {object} data The response data from WIRA
 * @param {boolean} [includeOptionsText=true] Whether to append options as text lines
 * @returns {string} Formatted text
 */
const formatWiraResponse = (data, includeOptionsText = true) => {
  console.log("Include Option data :>", includeOptionsText);
  console.log(
    "Line10 whatsapp.services.js",
    data,
    "wira response data,",
    data?.jobs,
  );
  if (!data) {
    return "How can I help you today?";
  }

  let text = data.content || "";
  text = text.trim();
  if (!text) {
    text = "How can I help you today?"; // Fallback message
  }

  if (
    includeOptionsText &&
    data.options &&
    Array.isArray(data.options) &&
    data.options.length > 0
  ) {
    text += "\n\n*Options:*";
    data.options.forEach((opt, idx) => {
      text += `\n${idx + 1}. ${opt}`;
    });
  }

  if (data.links && Array.isArray(data.links) && data.links.length > 0) {
    text += "\n\n🔗 *Important Links:*";
    data.links.forEach((link, idx) => {
      if (typeof link === "string" && link.trim() !== "") {
        const label = getSmartUrlLabel(link, idx + 1);
        text += `\n${idx + 1}. *${label}:*\n${link.trim()}`;
      } else if (link && typeof link === "object") {
        const urlStr = (link.url || link.link || "").trim();
        const label =
          link.title ||
          link.name ||
          link.label ||
          getSmartUrlLabel(urlStr, idx + 1);
        if (urlStr) {
          text += `\n${idx + 1}. *${label}:*\n${urlStr}`;
        }
      }
    });
  }

  if (data.jobs && Array.isArray(data.jobs) && data.jobs.length > 0) {
    text += "\n\n*Jobs:*";
    const topJobs = data.jobs.slice(0, 5);
    topJobs.forEach((job, idx) => {
      const title =
        job.position_name || job.title || job.jobTitle || job.name || "Job";
      const company = job.clientname || job.company;
      const location =
        job.city ||
        job.locations ||
        job.jobLocation ||
        job.location ||
        "Remote";

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
      if (
        minExp !== undefined &&
        minExp !== null &&
        maxExp !== undefined &&
        maxExp !== null
      ) {
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
        if (val === null || val === undefined || val === "") return "";
        const num = Number(val);
        return isNaN(num) ? val : num.toLocaleString("en-IN");
      };
      const minSal = formatSalary(job.min_salary);
      const maxSal = formatSalary(job.max_salary);
      const salType = job.salary_type || "";
      const payType = job.pay_type || "";

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
            contactLine += ` (${contactInfo.join(" / ")})`;
          }
        } else {
          contactLine += contactInfo.join(" / ");
        }
        jobText += contactLine;
      }

      //Job View Link
      const jobId = job.id || job.job_id || job.jobId || job.jobid;
      if (jobId) {
        jobText += `\n🔗 *Job Details:* https://www.white-force.com/job-description/${jobId}/whiteforce`;
      }

      text += jobText;
    });
  }

  // Limit to WhatsApp character limit (4096)
  if (text.length > 4096) {
    text = text.substring(0, 4093) + "...";
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
const sendTextMessage = async (
  toPhoneNumber,
  messageBody,
  customPhoneNumberId = null,
) => {
  const phoneId = customPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const version = env.WHATSAPP_API_VERSION;

  if (!phoneId) {
    throw new Error("WhatsApp Phone Number ID is missing.");
  }
  if (!token || token === "placeholder_access_token_here") {
    throw new Error("WhatsApp Access Token is missing or placeholder.");
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  try {
    console.log(
      `[WhatsApp Service] Sending message to ${toPhoneNumber} using Phone ID: ${phoneId}...`,
    );
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: toPhoneNumber,
        type: "text",
        text: {
          body: messageBody,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  } catch (error) {
    // Secure logging to prevent leakage of accessToken which is in headers
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data?.error;
    console.error(
      `[WhatsApp Service Error] Failed to send message. HTTP Status: ${statusCode || "N/A"}. Code: ${errorDetails?.code || "N/A"}. Message: ${errorDetails?.message || error.message}`,
    );

    throw new Error(errorDetails?.message || error.message);
  }
};

/**
 * Helper to truncate text at word boundary without adding trailing '...'
 */
const getCleanTitle = (text, maxLen = 24) => {
  const trimmed = (text || "").trim();
  if (trimmed.length <= maxLen) return trimmed;
  const sub = trimmed.substring(0, maxLen);
  const lastSpace = sub.lastIndexOf(" ");
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
 * @param {string|null} [headerText] Optional header text (max 60 chars)
 * @param {string|null} [footerText] Optional footer text (max 60 chars)
 * @returns {Promise<object>} Meta API response data
 */
const sendInteractiveMessage = async (
  toPhoneNumber,
  bodyText,
  options,
  customPhoneNumberId = null,
  headerText = null,
  footerText = null,
) => {
  const phoneId = customPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const version = env.WHATSAPP_API_VERSION;

  if (!phoneId) {
    throw new Error("WhatsApp Phone Number ID is missing.");
  }
  if (!token || token === "placeholder_access_token_here") {
    throw new Error("WhatsApp Access Token is missing or placeholder.");
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  const textBody = (bodyText || "Please select an option below:")
    .trim()
    .substring(0, 1024);
  const validOptions = (options || []).filter(
    (opt) => opt && typeof opt === "string" && opt.trim() !== "",
  );

  if (validOptions.length === 0) {
    return sendTextMessage(toPhoneNumber, textBody, customPhoneNumberId);
  }

  // Decide between quick reply buttons (<= 3 options and title <= 20 chars) vs list (4 to 10 options or long titles)
  const canUseButtons =
    validOptions.length <= 3 &&
    validOptions.every((opt) => opt.trim().length <= 20);

  let interactiveObj;

  if (canUseButtons) {
    // Quick Reply Buttons (Max 3 buttons)
    const buttons = validOptions.map((opt) => {
      const cleanOpt = opt.trim();
      const btnTitle = cleanOpt.substring(0, 20).trim();
      const btnId = cleanOpt.substring(0, 200).trim();
      return {
        type: "reply",
        reply: {
          id: btnId || `btn_${Date.now()}`,
          title: btnTitle || "Select",
        },
      };
    });

    interactiveObj = {
      type: "button",
      body: {
        text: textBody,
      },
      action: {
        buttons: buttons,
      },
    };
  } else {
    // List Message (Up to 10 rows)
    const rows = validOptions.slice(0, 10).map((opt) => {
      const cleanOpt = opt.trim();
      const rowTitle = getCleanTitle(cleanOpt, 24);
      const rowDesc =
        cleanOpt.length > 24 ? cleanOpt.substring(0, 72).trim() : "";
      const rowId = cleanOpt.substring(0, 200).trim();

      const rowObj = {
        id: rowId || `row_${Date.now()}`,
        title: rowTitle || "Select Option",
      };
      if (rowDesc) {
        rowObj.description = rowDesc;
      }
      return rowObj;
    });

    interactiveObj = {
      type: "list",
      body: {
        text: textBody,
      },
      action: {
        button: "Select Option",
        sections: [
          {
            title: "Options",
            rows: rows,
          },
        ],
      },
    };
  }

  // Optional header (text max 60 chars)
  if (
    headerText &&
    typeof headerText === "string" &&
    headerText.trim() !== ""
  ) {
    interactiveObj.header = {
      type: "text",
      text: headerText.trim().substring(0, 60),
    };
  }

  // Optional footer (text max 60 chars)
  if (
    footerText &&
    typeof footerText === "string" &&
    footerText.trim() !== ""
  ) {
    interactiveObj.footer = {
      text: footerText.trim().substring(0, 60),
    };
  }

  const interactivePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhoneNumber,
    type: "interactive",
    interactive: interactiveObj,
  };

  try {
    console.log(
      `[WhatsApp Service] Sending interactive ${canUseButtons ? "button" : "list"} message to ${toPhoneNumber}...`,
    );
    const response = await axios.post(url, interactivePayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data?.error;
    console.error(
      `[WhatsApp Service Error] Failed to send interactive message. HTTP Status: ${statusCode || "N/A"}. Code: ${errorDetails?.code || "N/A"}. Message: ${errorDetails?.message || error.message}`,
    );

    throw new Error(errorDetails?.message || error.message);
  }
};

/**
 * Send interactive Location Request Message using Meta Cloud API
 * @param {string} toPhoneNumber Recipient phone number (wa_id)
 * @param {string} bodyText Text prompt asking for location (max 1024 chars)
 * @param {string} [customPhoneNumberId] Webhook-sourced phone number ID
 * @returns {Promise<object>} Meta API response data
 */
const sendLocationRequestMessage = async (
  toPhoneNumber,
  bodyText,
  customPhoneNumberId = null,
) => {
  const phoneId = customPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const version = env.WHATSAPP_API_VERSION;

  if (!phoneId || !token || token === "placeholder_access_token_here") {
    throw new Error("WhatsApp Phone Number ID or Access Token is missing.");
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;
  const textBody = (bodyText || "Please share your current location:")
    .trim()
    .substring(0, 1024);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhoneNumber,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: {
        text: textBody,
      },
      action: {
        name: "send_location",
      },
    },
  };

  try {
    console.log(
      `[WhatsApp Service] Sending location request message to ${toPhoneNumber}...`,
    );
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data?.error;
    console.error(
      `[WhatsApp Service Error] Failed to send location request message. HTTP Status: ${statusCode || "N/A"}. Message: ${errorDetails?.message || error.message}`,
    );
    throw new Error(errorDetails?.message || error.message);
  }
};

/**
 * Send interactive Call-To-Action (CTA) URL button message using Meta Cloud API
 * @param {string} toPhoneNumber Recipient phone number (wa_id)
 * @param {string} bodyText Main message text (max 1024 chars)
 * @param {string} url Target URL (e.g. https://...)
 * @param {string} [buttonText="Open Link"] Button label text (max 20 chars)
 * @param {string} [customPhoneNumberId] Webhook-sourced phone number ID
 * @param {string|null} [headerText] Optional header text (max 60 chars)
 * @param {string|null} [footerText] Optional footer text (max 60 chars)
 * @returns {Promise<object>} Meta API response data
 */
const sendCtaUrlMessage = async (
  toPhoneNumber,
  bodyText,
  url,
  buttonText = "Open Link",
  customPhoneNumberId = null,
  headerText = null,
  footerText = null,
) => {
  const phoneId = customPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const version = env.WHATSAPP_API_VERSION;

  if (!phoneId || !token || token === "placeholder_access_token_here") {
    throw new Error("WhatsApp Phone Number ID or Access Token is missing.");
  }

  const apiUrl = `https://graph.facebook.com/${version}/${phoneId}/messages`;
  const textBody = (bodyText || "Click the button below to open link:")
    .trim()
    .substring(0, 1024);
  let cleanUrl = (url || "").trim().replace(/[.,;:!)\]}]+$/, "");
  if (
    cleanUrl &&
    !cleanUrl.startsWith("http://") &&
    !cleanUrl.startsWith("https://")
  ) {
    cleanUrl = "https://" + cleanUrl;
  }
  const cleanBtnText =
    (buttonText || "Open Link").trim().substring(0, 20).trim() || "Open Link";

  if (!cleanUrl) {
    return sendTextMessage(toPhoneNumber, textBody, customPhoneNumberId);
  }

  const interactiveObj = {
    type: "cta_url",
    body: {
      text: textBody,
    },
    action: {
      name: "cta_url",
      parameters: {
        display_text: cleanBtnText,
        url: cleanUrl,
      },
    },
  };

  if (
    headerText &&
    typeof headerText === "string" &&
    headerText.trim() !== ""
  ) {
    interactiveObj.header = {
      type: "text",
      text: headerText.trim().substring(0, 60),
    };
  }

  if (
    footerText &&
    typeof footerText === "string" &&
    footerText.trim() !== ""
  ) {
    interactiveObj.footer = {
      text: footerText.trim().substring(0, 60),
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhoneNumber,
    type: "interactive",
    interactive: interactiveObj,
  };

  try {
    console.log(
      `[WhatsApp Service] Sending interactive CTA URL message to ${toPhoneNumber} (${cleanUrl})...`,
    );
    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data?.error;
    console.error(
      `[WhatsApp Service Error] Failed to send CTA URL message. HTTP Status: ${statusCode || "N/A"}. Message: ${errorDetails?.message || error.message}`,
    );
    throw new Error(errorDetails?.message || error.message);
  }
};

const mimeToExt = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/plain": "txt",
  "audio/ogg; codecs=opus": "ogg",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/amr": "amr",
  "audio/aac": "aac",
};

/**
 * Downloads a media file from WhatsApp Meta Cloud API and saves it locally
 * @param {string} mediaId
 * @param {string|null} originalFilename
 * @returns {Promise<object>} File information
 */
const downloadWhatsAppMedia = async (mediaId, originalFilename = null) => {
  // Support testing mode with mock media IDs
  if (mediaId && mediaId.startsWith("test_")) {
    console.log(
      `[WhatsApp Service] Simulating download for mock media ID: ${mediaId}`,
    );
    let mimeType = "application/pdf";
    if (mediaId.includes("image")) {
      mimeType = "image/jpeg";
    } else if (mediaId.includes("audio") || mediaId.includes("voice")) {
      mimeType = "audio/ogg; codecs=opus";
    }
    const ext = mimeToExt[mimeType] || "bin";
    let savedFilename = originalFilename || `mock_${Date.now()}.${ext}`;
    if (originalFilename) {
      savedFilename = `${Date.now()}_${savedFilename.replace(/\s+/g, "_")}`;
    }

    const uploadsDir = path.join(__dirname, "..", "..", "uploads");
    const savePath = path.join(uploadsDir, savedFilename);

    await fs.promises.writeFile(
      savePath,
      `Mock content for media ID: ${mediaId}`,
    );
    console.log(
      `[WhatsApp Service] Mock media saved successfully at ${savePath}`,
    );

    return {
      filename: savedFilename,
      mimeType: mimeType,
      relativePath: `/uploads/${savedFilename}`,
    };
  }

  const token = env.WHATSAPP_ACCESS_TOKEN;
  const version = env.WHATSAPP_API_VERSION;

  if (!token || token === "placeholder_access_token_here") {
    throw new Error("WhatsApp Access Token is missing or placeholder.");
  }

  // 1. Get media metadata URL from Meta API
  const metadataUrl = `https://graph.facebook.com/${version}/${mediaId}`;
  console.log(
    `[WhatsApp Service] Fetching media metadata for ID: ${mediaId}...`,
  );

  const metaResponse = await axios.get(metadataUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
      Authorization: `Bearer ${token}`,
    },
    responseType: "arraybuffer",
  });

  // 3. Determine filename
  let savedFilename = originalFilename;
  if (!savedFilename) {
    const ext = mimeToExt[mimeType] || mimeType.split("/")[1] || "bin";
    savedFilename = `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
  } else {
    // Prepend a timestamp and sanitize spaces to prevent conflicts
    savedFilename = `${Date.now()}_${savedFilename.replace(/\s+/g, "_")}`;
  }

  const uploadsDir = path.join(__dirname, "..", "..", "uploads");
  const savePath = path.join(uploadsDir, savedFilename);

  // 4. Save to disk
  await fs.promises.writeFile(savePath, fileResponse.data);
  console.log(`[WhatsApp Service] Media saved successfully at ${savePath}`);

  return {
    filename: savedFilename,
    mimeType: mimeType,
    relativePath: `/uploads/${savedFilename}`,
  };
};

/**
 * Send Read Receipt (Blue Ticks) and Typing Indicator ("typing...") for an incoming message
 * @param {string} messageId Meta incoming message ID (wamid)
 * @param {string} [customPhoneNumberId] Webhook-sourced phone number ID
 * @returns {Promise<object|null>} Meta API response data or null on failure
 */
const markAsReadAndTyping = async (messageId, customPhoneNumberId = null) => {
  const phoneId = customPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const version = env.WHATSAPP_API_VERSION;

  if (
    !phoneId ||
    !token ||
    token === "placeholder_access_token_here" ||
    !messageId
  ) {
    return null;
  }

  // Support testing mode with mock message IDs
  if (messageId.startsWith("test_") || messageId.startsWith("mock_")) {
    console.log(
      `[WhatsApp Service] Simulating Read Receipt & Typing Indicator for mock message ID: ${messageId}`,
    );
    return { success: true, mock: true };
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  try {
    console.log(
      `[WhatsApp Service] Sending Read Receipt & Typing Indicator for message ID: ${messageId}...`,
    );
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: {
          type: "text",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data?.error;
    console.warn(
      `[WhatsApp Service Warning] Failed to send read receipt/typing indicator. HTTP Status: ${statusCode || "N/A"}. Message: ${errorDetails?.message || error.message}`,
    );
    return null;
  }
};

module.exports = {
  getSmartUrlLabel,
  formatWiraResponse,
  sendTextMessage,
  sendInteractiveMessage,
  sendLocationRequestMessage,
  sendCtaUrlMessage,
  downloadWhatsAppMedia,
  markAsReadAndTyping,
};
