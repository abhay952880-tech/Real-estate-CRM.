const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// 1. META ADS WEBHOOK ROUTES (VERIFICATION & RECEIVER)
// ==========================================

// Webhook Verification (GET Request)
app.get('/api/webhooks/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'my_crm_secret_token_123') {
    console.log('META_WEBHOOK_VERIFIED_SUCCESSFULLY');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Webhook Event Receiver (POST Request)
app.post('/api/webhooks/meta', (req, res) => {
  console.log('NEW_LEAD_RECEIVED_FROM_META:', JSON.stringify(req.body, null, 2));
  // Lead processing logic runs here
  return res.status(200).send('EVENT_RECEIVED');
});

// ==========================================
// 2. MAIN CRM HEALTH & APP ROUTES
// ==========================================

app.get('/', (req, res) => {
  res.send('Real Estate CRM API is Live and Running!');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CRM Backend operational' });
});

// Server Start
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
