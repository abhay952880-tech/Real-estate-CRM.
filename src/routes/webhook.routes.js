const express = require('express');
const router = express.Router();

// Webhook test route
router.post('/', (req, res) => {
    console.log('Webhook received:', req.body);
    res.status(200).json({ success: true, message: 'Webhook received successfully' });
});

module.exports = router;
