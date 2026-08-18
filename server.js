const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());

// Static files support - Yeh render par 'public' folder ke path ko 100% sahi jagah dhoondega
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/webhooks', require('./routes/webhook.routes'));
app.use('/api/leads', require('./routes/lead.routes'));

// Frontend fallback route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Database Connection & Server Start
const PORT = process.env.PORT || 10000;
const MONGO_URI = "mongodb+srv://abhay952880_db_user:BwPxFSXWEbzk3oRN@cluster0.izhyu6e.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('MongoDB Connected Successfully');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.log('DB Connection Error:', err));
