# WhatsApp Multi-Automation System

A powerful Node.js application that allows you to manage multiple WhatsApp accounts simultaneously with a modern web dashboard, real-time webhooks, and comprehensive message logging using Supabase database.

## 🚀 Features

### Core Features
- ✅ **Multi-Account Management**: Create and manage multiple WhatsApp accounts simultaneously
- ✅ **Modern Dashboard**: Beautiful dark theme with gradients and real-time updates
- ✅ **QR Code Authentication**: Easy WhatsApp Web authentication via QR codes
- ✅ **Webhook Support**: Individual webhooks for each account with delivery tracking
- ✅ **Message Logging**: Comprehensive logging of all incoming/outgoing messages
- ✅ **Real-time Updates**: Live status updates and message notifications
- ✅ **Secure Authentication**: Password-protected dashboard with session management

### Technical Features
- ✅ **Supabase Integration**: PostgreSQL database with real-time capabilities
- ✅ **Socket.IO**: Real-time communication between server and dashboard
- ✅ **WhatsApp Web.js**: Official WhatsApp Web API integration
- ✅ **Session Persistence**: LocalAuth strategy for maintaining sessions
- ✅ **Media Support**: Handle images, documents, and other media types
- ✅ **Error Handling**: Comprehensive error logging and recovery
- ✅ **Responsive Design**: Mobile-friendly dashboard interface

## 📋 Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn package manager
- Supabase account and project
- WhatsApp account(s) for authentication

## 🛠️ Installation

### 1) Clone the repository
```bash
git clone <repository-url>
cd whatsapp-automation-x2
```

### 2) Install dependencies
```bash
npm install
```

Note: On first run, WhatsApp Web.js may download a Chromium build (one-time ~100MB) for browser automation.

### 3) Create the database (Supabase)
1. Create a project at https://supabase.com
2. Open SQL editor and run `supabase-schema.sql`
3. Copy your Project URL, anon key, and service role key

### 4) Configure environment variables
Create a `.env` in project root (see `env.example`):

```env
# Server
PORT=3000
NODE_ENV=development

# Dashboard auth
DASHBOARD_PASSWORD=your-secure-password
DASHBOARD_USERNAME=admin

# Sessions
SESSION_SECRET=your-super-secret-session-key-here

# Supabase
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Optional defaults
DEFAULT_WEBHOOK_URL=https://your-default-webhook.com/webhook

# Logging
LOG_LEVEL=info
```

### 5) Run the app
Development
```bash
npm run dev
```

Production
```bash
npm start
```

The app runs at:
- **Dashboard**: http://localhost:3000/dashboard
- **Login**: http://localhost:3000/login

### 6) Scripts (package.json)
- **start**: `node index.js`
- **dev**: `nodemon index.js`
- **test**: `node test.js`

## 📱 Usage

### 1. Access the Dashboard

1. Navigate to http://localhost:3000/login
2. Use the credentials from your `.env` file
3. You'll be redirected to the dashboard

### 2. Create WhatsApp Accounts

1. Click "Add Account" in the dashboard
2. Enter a name and optional description
3. The system will generate a QR code
4. Scan the QR code with your WhatsApp mobile app
5. Wait for the account to connect (status will change to "Ready")

### 3. Configure Webhooks

1. Click "Webhooks" on any account
2. Add webhook URLs to receive message notifications
3. Optionally add a secret for security
4. Enable/disable webhooks as needed

### 4. Send Messages

1. Click "Send" on any connected account
2. Enter the phone number (with or without country code)
3. Type your message
4. Click "Send Message"

### 5. Monitor Activity

- View real-time statistics on the dashboard
- Check message logs for each account
- Monitor webhook delivery status
- Track success/failure rates

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - Login to dashboard
- `POST /api/auth/logout` - Logout from dashboard
- `GET /api/auth/user` - Get current user info

Auth uses cookie-based sessions. First call `POST /api/auth/login`, then send the returned cookie with subsequent requests.

Example:
```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-secure-password"}'

curl -b cookies.txt http://localhost:3000/api/accounts
```

### Accounts
- `GET /api/accounts` - Get all accounts
- `POST /api/accounts` - Create new account
- `GET /api/accounts/:id` - Get specific account
- `DELETE /api/accounts/:id` - Delete account
- `GET /api/accounts/:id/qr` - Get QR code for account

### Webhooks
- `GET /api/accounts/:id/webhooks` - Get webhooks for account
- `POST /api/webhooks` - Create new webhook
- `PATCH /api/webhooks/:id/toggle` - Toggle webhook status
- `DELETE /api/webhooks/:id` - Delete webhook

### Messages
- `POST /api/send` - Send message
- `GET /api/accounts/:id/logs` - Get message logs

Example (send text):
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<account-uuid>",
    "number": "+14155552671",
    "message": "Hello from API"
  }'
```

### Media
- `POST /api/send-media` - Send media via JSON payload (base64 or URL)

Request body:
```json
{
  "account_id": "<account-uuid>",
  "number": "+14155552671",
  "media": {
    "data": "<base64>",
    "mimetype": "image/png"
    // OR use: "url": "https://example.com/file.png"
  },
  "caption": "optional caption",
  "options": {}
}
```

Example (URL media):
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/send-media \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<account-uuid>",
    "number": "+14155552671",
    "media": {"url": "https://picsum.photos/300"},
    "caption": "Random image"
  }'
```

### Health
- `GET /api/health` - Service health and uptime

### Webhook secrets
- `GET /api/accounts/:id/webhook-secrets` - List webhook IDs and secrets for an account

### Dashboard data views (JSON)
- `GET /views/dashboard`
- `GET /views/accounts`
- `GET /views/webhooks`
- `GET /views/messages`

### Statistics
- `GET /api/stats` - Get dashboard statistics

### Public Webhook
- `POST /webhook/:accountId` - Receive incoming webhooks

## 🚀 n8n Integration

### Optimized Webhook Reply API
- `POST /api/webhook-reply` - Send replies via n8n

This endpoint is specially optimized for n8n integration with the following features:

1. **Automatic n8n Detection**: The system automatically detects requests coming from n8n and applies optimizations.

2. **Asynchronous Processing**: When requests come from n8n, the system responds immediately with a "pending" status while processing the message in the background.

3. **Optimized Payload**: The system uses a streamlined payload format for n8n to reduce processing overhead.

4. **Webhook Secret Caching**: Webhook secrets are cached in memory to reduce database lookups.

5. **Parallel Webhook Processing**: Multiple webhooks are processed in parallel for better performance.

Example (quick ack + background send when `?source=n8n` or n8n User-Agent):
```bash
curl -X POST 'http://localhost:3000/api/webhook-reply?source=n8n' \
  -H 'Content-Type: application/json' \
  -d '{
    "account_id": "<account-uuid>",
    "number": "+14155552671",
    "message": "Hi from n8n",
    "webhook_secret": "<your-secret>"
  }'
```

### Example n8n HTTP Request Node Configuration

```json
{
  "parameters": {
    "method": "POST",
    "url": "http://your-server-address/api/webhook-reply",
    "authentication": "none",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "sendQuery": true,
    "queryParameters": {
      "parameters": [
        {
          "name": "source",
          "value": "n8n"
        }
      ]
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "account_id",
          "value": "your-account-id"
        },
        {
          "name": "number",
          "value": "={{$node[\"Previous Node\"].json[\"phone_number\"]}}"
        },
        {
          "name": "message",
          "value": "={{$node[\"Previous Node\"].json[\"message\"]}}"
        },
        {
          "name": "webhook_secret",
          "value": "your-webhook-secret"
        }
      ]
    },
    "options": {}
  }
}
```

### Testing n8n Integration

Use the included test script to verify performance:

```bash
node test-n8n-integration.js
```

## 📊 Database Schema

### Tables

1. **whatsapp_accounts**: Stores account information and status
2. **webhooks**: Stores webhook configurations for each account
3. **message_logs**: Stores all message activity and webhook delivery logs

### Key Fields

- Account status: `initializing`, `qr_ready`, `ready`, `disconnected`, `auth_failed`
- Message direction: `incoming`, `outgoing`, `webhook`, `webhook_incoming`
- Message status: `success`, `failed`

## 🔒 Security Features

- Password-protected dashboard
- Session-based authentication
- Webhook secrets for secure delivery
- Input validation and sanitization
- CORS protection
- Rate limiting (can be added)

## 🚀 Deployment

### Deploy to Render

1. Connect your repository to Render
2. Create a new Web Service
3. Set environment variables
4. Deploy

### Deploy to Railway

1. Connect your repository to Railway
2. Add environment variables
3. Deploy automatically

### Deploy to Heroku

1. Create a Heroku app
2. Set environment variables
3. Deploy using Git

## 📝 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment mode | No | development |
| `DASHBOARD_PASSWORD` | Dashboard password | Yes | - |
| `DASHBOARD_USERNAME` | Dashboard username | Yes | - |
| `SESSION_SECRET` | Session encryption key | Yes | - |
| `SUPABASE_URL` | Supabase project URL | Yes | - |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes | - |
| `DEFAULT_WEBHOOK_URL` | Optional default webhook used when creating accounts/webhooks programmatically | No | - |

## 🔧 Configuration

### Customizing Phone Number Format

Edit the `formatPhoneNumber` function in `utils/whatsappManager.js` to change the default country code:

```javascript
// Default to India (+91)
if (!cleaned.startsWith('+')) {
  cleaned = '+91' + cleaned; // Change this to your default country code
}
```

### Adding Custom Webhook Headers

Modify the webhook delivery in `utils/whatsappManager.js`:

```javascript
const response = await axios.post(webhook.url, messageData, {
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': webhook.secret || '',
    'X-Account-ID': accountId,
    'X-Custom-Header': 'your-custom-value' // Add custom headers
  },
  timeout: 10000
});
```

## 🐛 Troubleshooting

### Common Issues

1. **QR Code not appearing**
   - Wait a few seconds after creating account
   - Check browser console for errors
   - Ensure WhatsApp Web.js is properly initialized

2. **Messages not sending**
   - Verify account is authenticated (status: "ready")
   - Check phone number format
   - Review console logs for errors

3. **Webhook not receiving data**
   - Verify webhook URL is accessible
   - Check webhook is active
   - Monitor console logs for delivery status

4. **Database connection issues**
   - Verify Supabase credentials
   - Check network connectivity
   - Ensure database schema is properly set up

### Logs

Check the console output for detailed error messages and debugging information.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter any issues:

1. Check the troubleshooting section
2. Review the console logs
3. Verify your configuration
4. Open an issue on GitHub

## 🔄 Updates

Stay updated with the latest features and bug fixes by regularly pulling from the repository.

---

**Note**: This application uses WhatsApp Web.js which is not officially supported by WhatsApp. Use at your own risk and ensure compliance with WhatsApp's terms of service.