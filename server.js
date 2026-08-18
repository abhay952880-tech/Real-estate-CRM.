const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const brokerRoutes = require('./routes/broker');
const telecallerRoutes = require('./routes/telecaller');
const webhookRoutes = require('./routes/webhook');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/telecaller', telecallerRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---- Static frontend ----
app.use(express.static(path.join(__dirname, 'public')));

// SPA-ish fallback for the handful of HTML pages we ship
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Error handler (last resort) ----
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Real Estate CRM server running on port ${PORT}`);
});
