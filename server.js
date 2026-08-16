// Webhook Verification (GET)
app.get('/api/webhooks/meta', (req, res) => {
    const VERIFY_TOKEN = "YOUR_VERIFY_TOKEN"; // Jo token aapne Meta dashboard me dala ho
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
        if (mode === 'subscribe') {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(403);
    }
});

// Incoming Leads Receiver (POST)
app.post('/api/webhooks/meta', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhook_event = entry.messaging || entry.changes;
            // Yahan lead data parse karke database me save karne ka logic likhein
            console.log("New Lead Event Received:", JSON.stringify(webhook_event));
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});
