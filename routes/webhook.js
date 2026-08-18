const express = require('express');
const crypto = require('crypto');
const db = require('../utils/db');

const router = express.Router();

function getBrokerAndVerify(req, res) {
  const broker = db.findById('brokers', req.params.brokerId);
  if (!broker) {
    res.status(404).json({ error: 'Unknown broker/company for this webhook URL.' });
    return null;
  }
  const providedToken = req.query.token || req.query['hub.verify_token'] || req.headers['x-webhook-token'];
  if (providedToken !== broker.webhookToken) {
    res.status(403).json({ error: 'Invalid webhook token.' });
    return null;
  }
  return broker;
}

/**
 * GET verification handshake — mirrors the Meta/Facebook webhook verification
 * pattern (hub.mode / hub.verify_token / hub.challenge), so this same URL
 * also works if you ever wire it directly into a Meta product that requires
 * the standard GET verification step.
 */
router.get('/leads/:brokerId', (req, res) => {
  const broker = db.findById('brokers', req.params.brokerId);
  if (!broker) return res.status(404).send('Unknown broker.');

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'] || req.query.token;
  const challenge = req.query['hub.challenge'];

  if (challenge && token) {
    if (token === broker.webhookToken) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  // Simple reachability check (visiting the URL directly in a browser)
  if (token === broker.webhookToken) {
    return res.status(200).send('Webhook is live and ready to receive leads.');
  }
  return res.status(403).send('Invalid or missing token.');
});

/**
 * POST — receive a new lead.
 * Works great as the target URL for a Make.com scenario that pulls data from
 * Meta Lead Ads / a WhatsApp chatbot / social scraping tools and normalizes
 * it into this simple JSON shape:
 * {
 *   "name": "Roshan Patil",
 *   "phone": "7798124639",
 *   "email": "roshan@example.com",
 *   "source": "Meta Lead Ads",
 *   "location": "Noida",
 *   "budget": "50L-1Cr",
 *   "intent": "Buy",
 *   "size": "2 BHK",
 *   "message": "Interested in Sector 62 project"
 * }
 */
router.post('/leads/:brokerId', (req, res) => {
  const broker = getBrokerAndVerify(req, res);
  if (!broker) return;

  const { name, phone, email, source, location, budget, intent, size, message } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'A lead needs at least a name and a phone number.' });
  }

  // ---- Smart Routing Automation ----
  const callers = db.findMany('telecallers', (c) => c.brokerId === broker.id);
  const locationNorm = (location || '').trim().toLowerCase();

  let assignedTo = null;
  let status = 'Unclaimed';

  if (locationNorm) {
    const match = callers.find((c) =>
      (c.locationSpecialization || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .includes(locationNorm)
    );
    if (match) {
      assignedTo = match.id;
      status = 'New';
    }
  }

  const lead = {
    id: crypto.randomUUID(),
    brokerId: broker.id,
    name,
    phone,
    email: email || '',
    source: source || 'Webhook',
    location: location || '',
    budget: budget || '',
    intent: intent || '',
    size: size || '',
    message: message || '',
    status, // 'New' | 'Unclaimed' | 'Connected' | 'Failed'
    assignedTo,
    isHot: false,
    recordingUrl: null,
    createdAt: new Date().toISOString(),
  };
  db.insert('leads', lead);

  if (assignedTo) {
    const caller = db.findById('telecallers', assignedTo);
    db.updateById('telecallers', assignedTo, {
      stats: { ...caller.stats, assigned: (caller.stats?.assigned || 0) + 1 },
    });
  }

  res.status(201).json({
    success: true,
    routed: assignedTo ? 'assigned_by_location' : 'pushed_to_marketplace',
    lead,
  });
});

/**
 * PATCH — write answers back into an existing lead (e.g. after a Make.com
 * WhatsApp chatbot collects Location / Size / Budget / Intent answers).
 */
router.patch('/leads/:brokerId/:leadId', (req, res) => {
  const broker = getBrokerAndVerify(req, res);
  if (!broker) return;

  const lead = db.findById('leads', req.params.leadId);
  if (!lead || lead.brokerId !== broker.id) {
    return res.status(404).json({ error: 'Lead not found.' });
  }
  const allowed = ['location', 'size', 'budget', 'intent', 'message', 'email'];
  const patch = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  const updated = db.updateById('leads', lead.id, patch);
  res.json({ success: true, lead: updated });
});

module.exports = router;
