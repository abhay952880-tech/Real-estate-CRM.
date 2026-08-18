const express = require('express');
const db = require('../utils/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('telecaller'));

function safeCaller(c) {
  if (!c) return null;
  const { passwordHash, ...rest } = c;
  return rest;
}

// ---------- My profile ----------
router.get('/me', (req, res) => {
  const caller = db.findById('telecallers', req.user.id);
  res.json(safeCaller(caller));
});

// ---------- My assigned leads + marketplace (unclaimed) leads I can claim ----------
router.get('/leads', (req, res) => {
  const caller = db.findById('telecallers', req.user.id);
  if (!caller) return res.status(404).json({ error: 'Telecaller not found.' });

  const brokerLeads = db.findMany('leads', (l) => l.brokerId === req.user.brokerId);

  const assigned = brokerLeads
    .filter((l) => l.assignedTo === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const marketplace = brokerLeads
    .filter((l) => l.status === 'Unclaimed' && !l.assignedTo)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ assigned, marketplace });
});

// ---------- Claim an unclaimed marketplace lead (first click wins) ----------
router.post('/leads/:id/claim', (req, res) => {
  const lead = db.findById('leads', req.params.id);
  if (!lead || lead.brokerId !== req.user.brokerId) {
    return res.status(404).json({ error: 'Lead not found.' });
  }
  if (lead.status !== 'Unclaimed' || lead.assignedTo) {
    return res.status(409).json({ error: 'This lead has already been claimed by someone else.' });
  }
  const updated = db.updateById('leads', lead.id, {
    assignedTo: req.user.id,
    status: 'New',
    claimedAt: new Date().toISOString(),
  });
  const caller = db.findById('telecallers', req.user.id);
  db.updateById('telecallers', req.user.id, {
    stats: { ...caller.stats, assigned: (caller.stats?.assigned || 0) + 1 },
  });
  res.json(updated);
});

// ---------- Call Disposition: Connected / Failed / Top-Notch (Hot) ----------
router.post('/leads/:id/disposition', (req, res) => {
  const { outcome } = req.body; // 'Connected' | 'Failed' | 'TopNotch'
  const lead = db.findById('leads', req.params.id);
  if (!lead || lead.brokerId !== req.user.brokerId || lead.assignedTo !== req.user.id) {
    return res.status(404).json({ error: 'Lead not found or not assigned to you.' });
  }

  const patch = { lastCallAt: new Date().toISOString() };
  const caller = db.findById('telecallers', req.user.id);
  const stats = { ...caller.stats };

  if (outcome === 'Connected') {
    patch.status = 'Connected';
    stats.connected = (stats.connected || 0) + 1;
  } else if (outcome === 'Failed') {
    patch.status = 'Failed';
    stats.failed = (stats.failed || 0) + 1;
  } else if (outcome === 'TopNotch') {
    patch.status = 'Connected';
    patch.isHot = true;
    stats.hot = (stats.hot || 0) + 1;
    stats.connected = (stats.connected || 0) + 1;
  } else {
    return res.status(400).json({ error: 'Invalid outcome. Use Connected, Failed, or TopNotch.' });
  }

  const updated = db.updateById('leads', lead.id, patch);
  db.updateById('telecallers', req.user.id, { stats });
  res.json(updated);
});

module.exports = router;
