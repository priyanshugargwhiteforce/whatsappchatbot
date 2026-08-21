# WIRA Brain Integration Documentation: `POST /api/whatsapp/wira-hit-msg`

## 📌 Endpoint Overview
This API endpoint is used by **WIRA Brain** to asynchronously send messages (AI replies, quick options buttons, CTA links, job listings) to candidates on WhatsApp.

- **HTTP Method**: `POST`
- **Live Production URL**: `https://wfadmanager.astro-buddy.in/api/whatsapp-chatbot/wira-hit-msg`
- **Local Dev URL**: `http://localhost:8001/api/whatsapp/wira-hit-msg` (or `/api/whatsapp-chatbot/wira-hit-msg`)
- **Content-Type**: `application/json`

---

## 🔑 Headers & Authentication

| Header Name | Type | Value | Required |
| :--- | :--- | :--- | :--- |
| `Content-Type` | `string` | `application/json` | Yes |
| `x-api-key` | `string` | `WiraChatBotForWhatsAppChatBot08072026ChatBot` | Recommended |

*Note: In `development` mode (`NODE_ENV=development`), if `x-api-key` is omitted, the request is permitted for local testing.*

---

## 📦 Request Payload Specification

The API is flexible and accepts candidate `phone` (10-digit format like `7047490032` or 12-digit format like `917047490032`) and message content in multiple JSON formats.

### Parameter Details

| Field Name | Type | Description | Required | Example |
| :--- | :--- | :--- | :--- | :--- |
| `phone` | `string` | Candidate phone number (10 digits `7047490032` or 12 digits `917047490032`) | **Yes** | `"7047490032"` |
| `content` | `string` | Main message text body | **Yes** | `"Hello! Here are the top job matches for you."` |
| `options` | `Array<string>` | Quick reply interactive buttons/list choices (Max 3 buttons or 10 list rows) | Optional | `["Find IT Jobs", "Upload Resume", "Contact Support"]` |
| `links` | `Array<string\|object>` | Web URLs or objects (`{ title, url }`) to display as 1-click CTA URL buttons | Optional | `[{"title": "View Job", "url": "https://whiteforce.in/job/101"}]` |
| `jobs` | `Array<object>` | Job listings array (`position_name`, `city`, `clientname`, etc.) | Optional | `[{"position_name": "Node.js Dev", "city": "Noida"}]` |

---

## 💻 Sample Payload Examples

### 1. Plain Text Message
```json
{
  "phone": "7047490032",
  "content": "Hello! Thank you for contacting White Force. How can we help you today?"
}
```

### 2. Interactive Quick Reply Buttons
```json
{
  "phone": "7047490032",
  "content": "Please select how you would like to proceed:",
  "options": [
    "Explore Jobs",
    "Upload Resume",
    "Talk to HR"
  ]
}
```

### 3. Interactive 1-Click Link Button (CTA URL)
```json
{
  "phone": "7047490032",
  "content": "Here is the job opening for Senior React Developer:",
  "links": [
    {
      "title": "View Job Details",
      "url": "https://whiteforce.in/job/react-developer-101"
    }
  ]
}
```

### 4. Combined: Text + Options + Links
```json
{
  "phone": "7047490032",
  "content": "We found 2 matching roles for your profile.",
  "options": ["Apply to All", "Modify Search"],
  "links": [
    { "title": "Job Details", "url": "https://whiteforce.in/job/101" },
    { "title": "Apply Online", "url": "https://whiteforce.in/apply/101" }
  ]
}
### 5. Stringified JSON Wrapper Payload (WIRA Brain Response Format)
```json
{
  "data": "{\"statusCode\":200,\"success\":true,\"message\":\"Sending whatsapp message successfully.\",\"data\":{\"phone\":\"7047490032\",\"content\":\"Hello! I am Wira from White Force Group. I can help you find job openings...\",\"links\":[],\"options\":[\"Find jobs\",\"Check my applications\",\"Update my profile\"]}}"
}
```

---

## 📥 API Response Formats

### ✅ Success Response (`HTTP 200 OK`)
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Whatsapp message sent successfully",
  "data": {
    "phone": "917047490032",
    "messageId": "wamid.HBgMOTE3MDQ3NDkwMDMyFQIAERgSRUQ0MDZBQjNCNzQ5NUFDQkNBAA==",
    "metaResponse": { ... }
  }
}
```

### ❌ Missing Phone Number (`HTTP 400 Bad Request`)
```json
{
  "statusCode": 400,
  "success": false,
  "message": "Error sending message: 'phone' (recipient number) is required.",
  "data": null
}
```

### 🔒 Unauthorized (`HTTP 401 Unauthorized`)
```json
{
  "statusCode": 401,
  "success": false,
  "message": "Unauthorized: Invalid or missing x-api-key header.",
  "data": null
}
```

---

## ⚡ Code Snippets for Integration

### cURL Command
```bash
curl -X POST "https://wfadmanager.astro-buddy.in/api/whatsapp-chatbot/wira-hit-msg" \
  -H "Content-Type: application/json" \
  -H "x-api-key: WiraChatBotForWhatsAppChatBot08072026ChatBot" \
  -d '{
    "phone": "7047490032",
    "content": "Hello! Check out our job openings:",
    "options": ["View Jobs", "Upload CV"],
    "links": [{"title": "Open Portal", "url": "https://whiteforce.in/jobs"}]
  }'
```

### Node.js (Axios)
```javascript
const axios = require('axios');

async function sendWhatsAppResponse(phone, textContent, options = [], links = []) {
  try {
    const res = await axios.post('http://localhost:8001/api/whatsapp/wira-hit-msg', {
      phone: phone,
      content: textContent,
      options: options,
      links: links
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'WiraChatBotForWhatsAppChatBot08072026ChatBot'
      }
    });

    console.log('WhatsApp message sent successfully:', res.data);
    return res.data;
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error.response?.data || error.message);
  }
}
```
