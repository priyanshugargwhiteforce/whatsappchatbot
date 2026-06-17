# WIRA AI WhatsApp Chatbot MVP

An MVP WhatsApp chatbot integration with existing WIRA AI APIs. The chatbot receives incoming messages from users via Meta Cloud API Webhook, forwards queries to WIRA AI (initiating or continuing a chatbot session), formats WIRA's response into WhatsApp-friendly text, and sends it back to the user.

## Technology Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **HTTP Client:** Axios
- **Database:** MySQL (using `mysql2/promise` connection pool)
- **Secrets Management:** dotenv

---

## Setup & Installation

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Copy `.env.example` to `.env` and configure your credentials:

   ```bash
   cp .env.example .env
   ```

3. **Database Configuration**
   Ensure your MySQL server is running, and the credentials (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) are correctly configured in `.env`.
   - The server will automatically connect to the database and initialize the tables (`wira_whatsapp_sessions` and `wira_whatsapp_message_logs`) if they do not exist when starting up.
   - **Crucial:** No existing tables will be dropped or modified during startup initialization.

4. **Start the Application**
   - **For Development (with Nodemon automatic reload):**
     ```bash
     npm run dev
     ```
   - **For Production:**
     ```bash
     npm start
     ```

---

## Environment Variables (.env)

Below are the variables defined in `.env`:

- `PORT`: Port on which the chatbot server runs (defaults to `8001`).
- `NODE_ENV`: Application environment (`development` or `production`).
- `META_VERIFY_TOKEN`: A custom string token you choose for Meta webhook configuration.
- `WHATSAPP_ACCESS_TOKEN`: The System User Access Token from your Meta Developer console.
- `WHATSAPP_PHONE_NUMBER_ID`: The Phone Number ID associated with your WhatsApp business number.
- `WHATSAPP_API_VERSION`: API version for Meta Cloud API calls (defaults to `v24.0`).
- `WIRA_BASE_URL`: Base URL for WIRA AI chatbot APIs (`https://astro-buddy.in/AI`).
- `WIRA_WEB_NAME`: Chatbot name filter (defaults to `White Force`).
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: MySQL connection parameters.

---

## Webhook Integration with Meta Dashboard

1. **Endpoint URLs:**
   - **GET** `https://wfadmanager.astro-buddy.in/api/whatsapp/webhook` - Used by Meta to verify your webhook.
   - **POST** `https://wfadmanager.astro-buddy.in/api/whatsapp/webhook` - Receives incoming live messages.

2. **Meta Developer Console Setup:**
   - Go to your app in the **Meta App Dashboard**.
   - Navigate to **WhatsApp > Configuration**.
   - Click **Edit** under **Webhook**.
   - Enter your callback URL: `https://wfadmanager.astro-buddy.in/api/whatsapp/webhook`.
   - Enter the exact verify token defined in your `.env` as the **Verify Token** (e.g. `WhiteForceWhatsAppAPIWebhookToken@09062026byPriyanshu`).
   - Click **Verify and Save**.
   - Under **Webhook Fields**, subscribe to **`messages`** updates.

---

## MVP Testing Steps (Development Mode)

These testing endpoints are disabled in production (`NODE_ENV=production`) for security.

### 1. Verification Endpoint Test

Test the webhook verification mechanism using curl:

```bash
curl -G "http://localhost:8001/api/whatsapp/webhook" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=WhiteForceWhatsAppAPIWebhookToken@09062026byPriyanshu" \
  --data-urlencode "hub.challenge=test_challenge_code"
```

_Expected Response:_ `test_challenge_code` with HTTP status `200`.

### 2. Database Cleanup (Test Helper)

Clear existing logs and sessions in database for a fresh test run:

```bash
curl -X POST "http://localhost:8001/api/whatsapp/test/clear-logs"
```

_Expected Response:_

```json
{
  "success": true,
  "message": "Successfully cleared sessions and message logs in database."
}
```

### 3. Simulate Incoming Message (Session Init / Welcoming)

Simulate a user sending "Hi" to your chatbot:

```bash
curl -X POST "http://localhost:8001/api/whatsapp/test/incoming" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "919999999999",
    "text": "Hi",
    "name": "Test User",
    "messageId": "msg_id_001"
  }'
```

_Expected Action:_

1. HTTP 200 returned immediately.
2. Async background process initializes:
   - Registers incoming log with `message_id = msg_id_001`.
   - Sees no active session for `919999999999`.
   - Calls WIRA `/start-chatbot`.
   - Saves session ID in `wira_whatsapp_sessions`.
   - Calls Meta WhatsApp Send API to reply with WIRA's formatted welcome message.
   - Logs the outgoing response.

### 4. Simulate Subsequent Message (Session Continuation)

Send a second query to the chatbot:

```bash
curl -X POST "http://localhost:8001/api/whatsapp/test/incoming" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "919999999999",
    "text": "Tell me about White Force",
    "name": "Test User",
    "messageId": "msg_id_002"
  }'
```

_Expected Action:_

1. HTTP 200 returned immediately.
2. Background process finds active session for `919999999999` in `wira_whatsapp_sessions`.
3. Calls WIRA `/reply-chatbot` using that session ID.
4. Sends the formatted response to the user via Meta Cloud API.

### 5. Simulate Duplicate Message ID Prevention

Send a request with a duplicate `messageId`:

```bash
curl -X POST "http://localhost:8001/api/whatsapp/test/incoming" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "919999999999",
    "text": "Hi again",
    "name": "Test User",
    "messageId": "msg_id_001"
  }'
```

_Expected Action:_

- HTTP 200 returned immediately.
- Background process detects duplicate message ID `msg_id_001` and aborts processing before making any WIRA API calls or sending duplicate replies.
