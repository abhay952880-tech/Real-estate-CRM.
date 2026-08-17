const express = require('express');
const router = express.Router();

// 1. Meta Webhook Verification (GET)
router.get('/meta', (req, res) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'my_secure_verify_token';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// 2. Meta Lead Receive Endpoint (POST)
router.post('/meta', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'page') {
            console.log('Webhook received event:', JSON.stringify(body, null, 2));
            res.status(200).send('EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
