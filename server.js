const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const connectDB = require('./src/config/db');

const app = express();

// Security & Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Database Connection
connectDB();

// Test Route
app.get('/', (req, res) => {
    res.json({ status: 'success', message: 'Prop Flow CRM API is running successfully!' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
