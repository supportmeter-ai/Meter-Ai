# Meter AI

Meter AI is a browser extension and companion web service built for heavy users of Claude.ai. It tracks active session limits, forecasts reset countdowns, logs historical usage analytics locally, and manages conversation handoffs to alternative AI providers when limits are reached.

![Meter AI Infographic](public/assets/infographic.png)

## Core Capabilities

### Live Session Tracking
Meter AI injects a status bar directly underneath the prompt input field on Claude.ai. It calculates and visualizes:
- **Usage Percentage**: Active tracking of prompt and completion token volumes relative to Claude's model limits.
- **Message Projections**: Live estimates of remaining messages for both Claude 3.5 Sonnet and Claude 3 Opus.
- **Reset Countdown**: A precise timer displaying exactly when the current usage quota resets.

### Context Bridge
When Claude.ai rate limits are hit, Context Bridge enables a single-click transition of the active chat. The extension parses the local conversation context, structures it, and opens it directly in:
- ChatGPT
- Google Gemini
- Grok

No manual copy-and-paste is required. The bridge formats the history so users can pick up their task immediately on the new platform.

### Rolling Usage Analytics
All prompt counts, active hours, and model interactions are compiled into local analytics. Users can review:
- Daily and weekly usage trends.
- Rolling seven-day quota summaries to help budget message distribution.
- Model efficiency metrics across different workspace projects.

### Privacy-First Architecture
Meter AI does not transmit conversation contents or prompt texts to external servers. All text processing and history storage occur locally within the browser extension's sandbox. The companion backend database is utilized solely for authenticating account subscriptions and syncing license status across devices.

### Year-in-Review Wrapped
An annual statistics visualizer aggregates total prompts sent, productive hours logged, preferred models, and estimated subscription value realized throughout the year.

---

## Getting Started

### 1. Install the Extension
Add the Meter AI extension to the browser via the Chrome Web Store. Once installed, pin the extension to the browser toolbar for quick access.

### 2. Accessing the Dashboard
Log into the companion web interface to activate account profiles. Google authentication is used to securely manage user profiles and synchronize plan status.

### 3. Usage
- **Monitoring**: Open Claude.ai. The status bar will automatically initialize at the bottom of the main chat workspace.
- **Handoffs**: When rate-limited, select the preferred alternative provider from the popup menu or status link. The extension will automatically migrate the chat history to the destination tab.

---

## Subscription Plans

Meter AI offers three service tiers tailored to different usage patterns:

### Free Tier
- Real-time session monitoring and limit forecasting.
- Local usage history logs.
- Two Context Bridge transfers per day.

### Pro Monthly (₹169/month)
- Unlimited Context Bridge handoffs.
- Full access to historical analytics dashboards.
- Cross-device profile synchronization.
- One-time monthly charge with manual renewal options.

### Pro Lifetime (₹1,999 one-time payment)
- Permanent access to all present and future Pro features.
- No recurring subscription charges.
