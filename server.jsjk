/**
 * Multi-Tenant Real Estate CRM & Automation Engine
 * Stack: Node.js, Express, SQLite3 (Database), Vue.js 3 (CDN UI), Tailwind CSS
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// MODULE 1: MASTER DATA ARCHITECTURE (DATABASE)
// ==========================================
const db = new sqlite3.Database(':memory:'); // Use persistent path in production

db.serialize(() => {
  // 1. Brokers Table
  db.run(`
    CREATE TABLE IF NOT EXISTS Brokers (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      target_locations TEXT, -- Stored as CSV: "Noida,Delhi"
      budget_brackets TEXT,  -- Stored as CSV: "Below 50L,50L-1Cr,1Cr+"
      cloud_call_recording BOOLEAN DEFAULT 0
    )
  `);

  // 2. Telecallers Table
  db.run(`
    CREATE TABLE IF NOT EXISTS Telecallers (
      id TEXT PRIMARY KEY,
      broker_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      location_specialization TEXT NOT NULL,
      FOREIGN KEY (broker_id) REFERENCES Brokers(id)
    )
  `);

  // 3. Leads Table
  db.run(`
    CREATE TABLE IF NOT EXISTS Leads (
      id TEXT PRIMARY KEY,
      broker_id TEXT NOT NULL,
      caller_id TEXT,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      source TEXT NOT NULL,
      budget TEXT,
      location TEXT NOT NULL,
      intent TEXT,
      status TEXT CHECK(status IN ('Unassigned', 'Assigned', 'Connected', 'Failed', 'Top-Notch')) DEFAULT 'Unassigned',
      recording_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (broker_id) REFERENCES Brokers(id),
      FOREIGN KEY (caller_id) REFERENCES Telecallers(id)
    )
  `);

  // Seed Default Multi-Tenant Data for Instant Testing
  const brokerId = 'b101';
  db.run(`INSERT INTO Brokers VALUES ('${brokerId}', 'Apex Properties', 'admin@apex.com', '+919876543210', 'Noida,Delhi,Gurgaon', 'Below 50L,50L-1Cr,1Cr+', 1)`);
  db.run(`INSERT INTO Telecallers VALUES ('c201', '${brokerId}', 'Rahul Sharma', 'rahul@apex.com', '+919811111111', 'Noida')`);
  db.run(`INSERT INTO Telecallers VALUES ('c202', '${brokerId}', 'Priya Singh', 'priya@apex.com', '+919822222222', 'Delhi')`);
});

// ==========================================
// MODULE 4: SYSTEM LOGIC & ROUTING ENGINE
// ==========================================

// Webhook for Facebook/Meta Ads & Social Media Lead Ingestion
app.post('/api/webhooks/incoming-lead', (req, res) => {
  const { broker_id, client_name, client_phone, source, location, budget, intent } = req.body;

  if (!broker_id || !client_name || !client_phone || !location) {
    return res.status(400).json({ status: 'error', message: 'Missing essential fields.' });
  }

  const leadId = 'lead_' + crypto.randomBytes(4).toString('hex');

  // Priority 1: Check Caller Specialization Match
  db.get(
    `SELECT id FROM Telecallers WHERE broker_id = ? AND LOWER(location_specialization) = LOWER(?) LIMIT 1`,
    [broker_id, location],
    (err, caller) => {
      let assignedCallerId = null;
      let initialStatus = 'Unassigned';

      if (caller) {
        assignedCallerId = caller.id;
        initialStatus = 'Assigned';
      }

      db.run(
        `INSERT INTO Leads (id, broker_id, caller_id, client_name, client_phone, source, budget, location, intent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [leadId, broker_id, assignedCallerId, client_name, client_phone, source || 'Meta Ads', budget, location, intent, initialStatus],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          
          res.status(201).json({
            status: 'success',
            lead_id: leadId,
            assigned_caller: assignedCallerId || 'Marketplace Pool (Priority 2 Triggered)'
          });
        }
      );
    }
  );
});

// Marketplace Claim Model API (Priority 2)
app.post('/api/leads/claim', (req, res) => {
  const { lead_id, caller_id } = req.body;

  db.get(`SELECT status FROM Leads WHERE id = ?`, [lead_id], (err, lead) => {
    if (!lead || lead.status !== 'Unassigned') {
      return res.status(400).json({ status: 'failed', message: 'Lead already claimed or unavailable.' });
    }

    db.run(
      `UPDATE Leads SET caller_id = ?, status = 'Assigned' WHERE id = ?`,
      [caller_id, lead_id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'success', message: 'Lead successfully claimed.' });
      }
    );
  });
});

// Callback API for Make.com / Chatbot Data Synchronization
app.post('/api/leads/sync-chatbot', (req, res) => {
  const { lead_id, budget, location, intent } = req.body;
  db.run(
    `UPDATE Leads SET budget = COALESCE(?, budget), location = COALESCE(?, location), intent = COALESCE(?, intent) WHERE id = ?`,
    [budget, location, intent, lead_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'success', message: 'Data synced successfully.' });
    }
  );
});

// Broker Settings API
app.get('/api/broker/:id', (req, res) => {
  db.get(`SELECT * FROM Brokers WHERE id = ?`, [req.params.id], (err, broker) => {
    res.json(broker);
  });
});

app.post('/api/broker/update', (req, res) => {
  const { broker_id, target_locations, budget_brackets, cloud_call_recording } = req.body;
  db.run(
    `UPDATE Brokers SET target_locations = ?, budget_brackets = ?, cloud_call_recording = ? WHERE id = ?`,
    [target_locations, budget_brackets, cloud_call_recording ? 1 : 0, broker_id],
    (err) => {
      res.json({ status: 'success' });
    }
  );
});

// Telecallers APIs
app.get('/api/telecallers/:broker_id', (req, res) => {
  db.all(`SELECT * FROM Telecallers WHERE broker_id = ?`, [req.params.broker_id], (err, rows) => {
    res.json(rows);
  });
});

app.post('/api/telecallers/add', (req, res) => {
  const { broker_id, name, email, phone, location_specialization } = req.body;
  const callerId = 'c' + Date.now();
  db.run(
    `INSERT INTO Telecallers VALUES (?, ?, ?, ?, ?, ?)`,
    [callerId, broker_id, name, email, phone, location_specialization],
    (err) => {
      res.json({ status: 'success', caller_id: callerId });
    }
  );
});

// Analytics Leaderboard API
app.get('/api/analytics/leaderboard/:broker_id', (req, res) => {
  const query = `
    SELECT 
      t.id as caller_id, t.name, t.phone,
      COUNT(l.id) as total_assigned,
      SUM(CASE WHEN l.status = 'Connected' THEN 1 ELSE 0 END) as connected,
      SUM(CASE WHEN l.status = 'Failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN l.status = 'Top-Notch' THEN 1 ELSE 0 END) as top_notch
    FROM Telecallers t
    LEFT JOIN Leads l ON t.id = l.caller_id
    WHERE t.broker_id = ?
    GROUP BY t.id
  `;
  db.all(query, [req.params.broker_id], (err, rows) => {
    res.json(rows);
  });
});

// Telecaller Leads View APIs
app.get('/api/leads/caller/:caller_id', (req, res) => {
  db.all(`SELECT * FROM Leads WHERE caller_id = ? ORDER BY created_at DESC`, [req.params.caller_id], (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/leads/unassigned/:broker_id', (req, res) => {
  db.all(`SELECT * FROM Leads WHERE broker_id = ? AND status = 'Unassigned'`, [req.params.broker_id], (err, rows) => {
    res.json(rows);
  });
});

// Call Disposition Update API
app.post('/api/leads/update-status', (req, res) => {
  const { lead_id, status } = req.body;
  const mockAudioUrl = status === 'Connected' || status === 'Top-Notch' 
    ? 'https://www.w3schools.com/html/horse.mp3' 
    : null;

  db.run(
    `UPDATE Leads SET status = ?, recording_url = COALESCE(?, recording_url) WHERE id = ?`,
    [status, mockAudioUrl, lead_id],
    (err) => {
      res.json({ status: 'success' });
    }
  );
});

// ==========================================
