const express = require('express');
const app = express();

app.use(express.json());

app.get('/api/webhooks/meta', (req, res) => {
    const VERIFY_TOKEN = "my_realestate_crm_token_123";
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED");
        return res.status(200).send(challenge);
    } else {
        return res.sendStatus(403);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
