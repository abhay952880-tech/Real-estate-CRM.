const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../utils/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('broker'));

function safeBroker(b) {
  if (!b) return null;
  const { passwordHash, ...rest } = b;
  return rest;
}
function safeCaller(c) {
  if (!c) return null;
  const { passwordHash, ...rest } = c;
  return rest;
}

// ---------- Get current broker profile + config ----------
router.get('/me', (req, res) => {
  const broker = db.findById('brokers', req.user.brokerId);
  if (!broker) return res.status(404).json({ error: 'Broker not found.' });
  const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/leads/${broker.id}?token=${broker.webhookToken}`;
  res.json({ ...safeBroker(broker), webhookUrl });
});

// ---------- Update configuration (locations, budget brackets, call recording) ----------
router.put('/config', (req, res) => {
  const { targetLocations, budgetBrackets, callRecordingEnabled, companyName, phone } = req.body;
  const patch = {};
  if (Array.isArray(targetLocations)) patch.targetLocations = targetLocations;
  else if (typeof targetLocations === 'string') {
    patch.targetLocations = targetLocations.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(budgetBrackets)) patch.budgetBrackets = budgetBrackets;
  else if (typeof budgetBrackets === 'string') {
    patch.budgetBrackets = budgetBrackets.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (typeof callRecordingEnabled === 'boolean') patch.callRecordingEnabled = callRecordingEnabled;
  if (companyName) patch.companyName = companyName;
  if (phone) patch.phone = phone;

  const updated = db.updateById('brokers', req.user.brokerId, patch);
  res.json(safeBroker(updated));
});

// ---------- Team Management: Add Telecaller (ADMIN ONLY can add) ----------
router.post('/telecallers', (req, res) => {
  const { name, email, phone, locationSpecialization, password } = req.body;
  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'Name, email and phone are required for a telecaller.' });
  }
  const existing = db.findOne('telecallers', (c) => c.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'A telecaller with this email already exists.' });
  }
  const tempPassword = password || crypto.randomBytes(4).toString('hex');
  const caller = {
    id: crypto.randomUUID(),
    role: 'telecaller',
    brokerId: req.user.brokerId,
    name,
    email,
    phone,
    locationSpecialization: locationSpecialization || '',
    passwordHash: bcrypt.hashSync(tempPassword, 10),
    stats: { assigned: 0, connected: 0, failed: 0, hot: 0 },
    createdAt: new Date().toISOString(),
  };
  db.insert('telecallers', caller);
  res.status(201).json({ telecaller: safeCaller(caller), tempPassword });
});

// ---------- List all telecallers for this broker ----------
router.get('/telecallers', (req, res) => {
  const list = db.findMany('telecallers', (c) => c.brokerId === req.user.brokerId).map(safeCaller);
  res.json(list);
});

// ---------- Remove a telecaller ----------
router.delete('/telecallers/:id', (req, res) => {
  const caller = db.findById('telecallers', req.params.id);
  if (!caller || caller.brokerId !== req.user.brokerId) {
    return res.status(404).json({ error: 'Telecaller not found.' });
  }
  db.removeById('telecallers', req.params.id);
  res.json({ success: true });
});

// ---------- All leads for this broker (with optional filters) ----------
router.get('/leads', (req, res) => {
  const { status, callerId } = req.query;
  let leads = db.findMany('leads', (l) => l.brokerId === req.user.brokerId);
  if (status) leads = leads.filter((l) => l.status === status);
  if (callerId) leads = leads.filter((l) => l.assignedTo === callerId);
  leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(leads);
});

// ---------- Live Analytics Leaderboard ----------
router.get('/analytics', (req, res) => {
  const callers = db.findMany('telecallers', (c) => c.brokerId === req.user.brokerId);
  const leads = db.findMany('leads', (l) => l.brokerId === req.user.brokerId);

  const leaderboard = callers.map((c) => {
    const callerLeads = leads.filter((l) => l.assignedTo === c.id);
    return {
      id: c.id,
      name: c.name,
      locationSpecialization: c.locationSpecialization,
      totalAssigned: callerLeads.length,
      connected: callerLeads.filter((l) => l.status === 'Connected').length,
      failed: callerLeads.filter((l) => l.status === 'Failed').length,
      hot: callerLeads.filter((l) => l.isHot).length,
      recordings: callerLeads
        .filter((l) => l.recordingUrl)
        .map((l) => ({ leadId: l.id, leadName: l.name, url: l.recordingUrl })),
    };
  });

  const summary = {
    totalLeads: leads.length,
    unclaimed: leads.filter((l) => l.status === 'Unclaimed').length,
    connected: leads.filter((l) => l.status === 'Connected').length,
    failed: leads.filter((l) => l.status === 'Failed').length,
    hot: leads.filter((l) => l.isHot).length,
  };

  res.json({ leaderboard, summary });
});

module.exports = router;
