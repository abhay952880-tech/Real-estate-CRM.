const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../utils/db');
const { signToken } = require('../middleware/auth');

const router = express.Router();

// ---------- Broker (Admin) Signup / Onboarding ----------
router.post('/broker/signup', (req, res) => {
  const { companyName, phone, email, password } = req.body;
  if (!companyName || !phone || !email || !password) {
    return res.status(400).json({ error: 'Company name, phone, email and password are all required.' });
  }
  const existing = db.findOne('brokers', (b) => b.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const broker = {
    id: crypto.randomUUID(),
    role: 'broker',
    companyName,
    phone,
    email,
    passwordHash: hash,
    targetLocations: [],
    budgetBrackets: [],
    callRecordingEnabled: false,
    webhookToken: crypto.randomBytes(16).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  db.insert('brokers', broker);

  const token = signToken({ id: broker.id, role: 'broker', brokerId: broker.id, name: broker.companyName });
  const { passwordHash, ...safeBroker } = broker;
  res.status(201).json({ token, user: safeBroker });
});

// ---------- Universal Login (broker OR telecaller) ----------
router.post('/login', (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Email, password and role are required.' });
  }

  if (role === 'broker') {
    const broker = db.findOne('brokers', (b) => b.email.toLowerCase() === email.toLowerCase());
    if (!broker || !bcrypt.compareSync(password, broker.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = signToken({ id: broker.id, role: 'broker', brokerId: broker.id, name: broker.companyName });
    const { passwordHash, ...safeBroker } = broker;
    return res.json({ token, user: safeBroker });
  }

  if (role === 'telecaller') {
    const caller = db.findOne('telecallers', (c) => c.email.toLowerCase() === email.toLowerCase());
    if (!caller || !bcrypt.compareSync(password, caller.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = signToken({ id: caller.id, role: 'telecaller', brokerId: caller.brokerId, name: caller.name });
    const { passwordHash, ...safeCaller } = caller;
    return res.json({ token, user: safeCaller });
  }

  return res.status(400).json({ error: 'Invalid role specified.' });
});

module.exports = router;
