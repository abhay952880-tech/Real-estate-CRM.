const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Meta Webhook Verification (GET)
app.get('/api/webhooks/meta', (req, res) => {
    const VERIFY_TOKEN = "my_realestate_crm_token_123";
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log("Mode:", mode);
    console.log("Token Received:", token);
    console.log("Challenge:", challenge);

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED SUCCESSFULLY');
            return res.status(200).send(challenge);
        } else {
            console.log('Token mismatch!');
            return res.sendStatus(403);
        }
    } else {
        console.log('Missing mode or token');
        return res.sendStatus(403);
    }
});

// Meta Lead Receiver (POST)
app.post('/api/webhooks/meta', (req, res) => {
    console.log('Incoming Webhook POST:', JSON.stringify(req.body));
    res.status(200).send('EVENT_RECEIVED');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
