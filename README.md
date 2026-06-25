# Meter AI

Meter AI is a browser extension and companion web application designed to track active usage sessions on Claude.ai, forecast limit resets, and manage conversation handoffs to alternative AI providers.

![Meter AI Infographic](public/assets/infographic.png)

## Architecture

The project is divided into two primary directories:

- `meter-extension/` - A Manifest V3 browser extension for Chrome, Firefox, and Chromium-based browsers.
- `meter-ai-website/` - An Express backend server and landing page application integrated with Supabase and Razorpay.

## Features

### Usage Monitoring
The extension injects a status bar directly into the Claude.ai user interface. It calculates and displays:
- Session prompt usage percentage.
- Estimates of remaining messages for active models.
- Countdown time remaining until the next limit reset.

### Context Bridge
If a rate limit is reached on Claude.ai, a single click transfers the conversation history to ChatGPT, Google Gemini, or Grok. The extension parses the local chat session, formats it as a single prompt, and loads it into the selected platform.

### Privacy and Local Storage
All conversation history and tracking records are saved locally in the browser's extension storage. No conversation data or context is sent to external servers. The only network requests made by the extension are optional checks to authenticate Pro license status.

### Administrative Panel
The backend contains a private admin dashboard accessed at `/admin` for management operations:
- **Overview & Stats**: View system metrics, recent webhooks, and active tickets.
- **User Database**: Manage user plan levels (Free, Pro Monthly, Pro Lifetime) and handle manual upgrades or downgrades.
- **Revenue Tracker**: Inspect payment history and calculate Monthly Recurring Revenue (MRR).
- **Kanban Task Board**: Manage internal tasks and notes.
- **Support & Feedback**: Reply to customer support queries using the Resend email service.
- **System Health**: Verify active integrations with Supabase, Razorpay, and Resend.

---

## Installation and Configuration

### 1. Browser Extension Installation
To load the extension locally in Chrome:
1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `meter-extension/` directory.

### 2. Website & Backend Setup
To run the Express backend server and database migrations:
1. Navigate to the website directory:
   ```bash
   cd meter-ai-website
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root of the `meter-ai-website/` directory containing the following configuration parameters:
   ```env
   PORT=3000
   DATABASE_URL="your-postgresql-connection-string"
   SUPABASE_URL="your-supabase-project-url"
   SUPABASE_SECRET_KEY="your-supabase-service-role-key"
   ADMIN_EMAIL="your-admin-email"
   ADMIN_PASSWORD_HASH="your-bcrypt-password-hash"
   ADMIN_JWT_SECRET="your-jwt-signing-secret"
   RAZORPAY_KEY_ID="your-razorpay-key-id"
   RAZORPAY_KEY_SECRET="your-razorpay-key-secret"
   RAZORPAY_WEBHOOK_SECRET="your-razorpay-webhook-secret"
   RESEND_API_KEY="your-resend-api-key"
   ```
4. Run the database migration script to construct the schema:
   ```bash
   node apply-schema.js
   ```
5. Start the web server:
   ```bash
   npm start
   ```
