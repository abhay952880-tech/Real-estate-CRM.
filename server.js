const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = new sqlite3.Database('./crm_data.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS Brokers (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      target_locations TEXT,
      budget_brackets TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Telecallers (
      id TEXT PRIMARY KEY,
      broker_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      location_specialization TEXT NOT NULL
    )
  `);

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
      status TEXT DEFAULT 'Unassigned',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`INSERT OR IGNORE INTO Brokers VALUES ('b101', 'Apex Properties', 'admin@apex.com', '+919876543210', 'Noida,Delhi,Gurgaon', '50L-1Cr,1Cr+')`);
});

// AUTO LEAD ROUTING LOGIC
function autoAssignLead(broker_id, location, callback) {
  db.get(
    `SELECT id FROM Telecallers WHERE broker_id = ? AND LOWER(location_specialization) = LOWER(?) LIMIT 1`,
    [broker_id, location.trim()],
    (err, row) => {
      if (row) {
        callback(row.id, 'Assigned');
      } else {
        callback(null, 'Unassigned');
      }
    }
  );
}

// META ADS WEBHOOK
app.get('/api/webhooks/meta', (req, res) => {
  const VERIFY_TOKEN = 'my_crm_secret_token_123';
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/api/webhooks/meta', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry?.forEach((entry) => {
      entry.changes?.forEach((change) => {
        if (change.field === 'leadgen') {
          const leadData = change.value;
          const leadId = 'fb_' + (leadData.leadgen_id || Date.now());
          const location = leadData.field_data?.city || 'Noida';

          autoAssignLead('b101', location, (assignedCallerId, initialStatus) => {
            db.run(
              `INSERT INTO Leads (id, broker_id, caller_id, client_name, client_phone, source, location, budget, status)
               VALUES (?, 'b101', ?, ?, ?, 'Meta Ads', ?, ?, ?)`,
              [
                leadId,
                assignedCallerId,
                leadData.field_data?.name || 'Meta Ad Client',
                leadData.field_data?.phone || 'N/A',
                location,
                leadData.field_data?.budget || '50L-1Cr',
                initialStatus
              ]
            );
          });
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// API ENDPOINTS
app.get('/api/broker/:id', (req, res) => {
  db.get(`SELECT * FROM Brokers WHERE id = ?`, [req.params.id], (err, broker) => res.json(broker || {}));
});

app.post('/api/broker/update', (req, res) => {
  const { broker_id, company_name, email, phone, target_locations, budget_brackets } = req.body;
  db.run(
    `UPDATE Brokers SET company_name = ?, email = ?, phone = ?, target_locations = ?, budget_brackets = ? WHERE id = ?`,
    [company_name, email, phone, target_locations, budget_brackets, broker_id],
    (err) => res.json({ status: 'success' })
  );
});

app.get('/api/telecallers/:broker_id', (req, res) => {
  db.all(`SELECT * FROM Telecallers WHERE broker_id = ?`, [req.params.broker_id], (err, rows) => res.json(rows || []));
});

app.post('/api/telecallers/add', (req, res) => {
  const { broker_id, name, email, phone, location_specialization } = req.body;
  const callerId = 'c_' + Date.now();
  db.run(
    `INSERT INTO Telecallers VALUES (?, ?, ?, ?, ?, ?)`,
    [callerId, broker_id, name, email, phone, location_specialization],
    (err) => res.json({ status: 'success', caller_id: callerId })
  );
});

app.post('/api/telecallers/delete', (req, res) => {
  db.run(`DELETE FROM Telecallers WHERE id = ?`, [req.body.id], (err) => res.json({ status: 'success' }));
});

app.get('/api/leads/all/:broker_id', (req, res) => {
  const query = `
    SELECT l.*, t.name as caller_name 
    FROM Leads l 
    LEFT JOIN Telecallers t ON l.caller_id = t.id 
    WHERE l.broker_id = ? 
    ORDER BY l.created_at DESC
  `;
  db.all(query, [req.params.broker_id], (err, rows) => res.json(rows || []));
});

// EXPORT LEADS TO CSV API
app.get('/api/leads/export/:broker_id', (req, res) => {
  const query = `
    SELECT l.id, l.client_name, l.client_phone, l.source, l.location, l.budget, l.status, l.created_at, COALESCE(t.name, 'Unassigned') as assigned_caller
    FROM Leads l 
    LEFT JOIN Telecallers t ON l.caller_id = t.id 
    WHERE l.broker_id = ? 
    ORDER BY l.created_at DESC
  `;
  db.all(query, [req.params.broker_id], (err, rows) => {
    if (err || !rows) return res.status(500).send('Error exporting data');

    let csvContent = 'ID,Client Name,Phone,Source,Location,Budget,Status,Created At,Assigned Caller\n';
    rows.forEach(r => {
      csvContent += `"${r.id}","${r.client_name}","${r.client_phone}","${r.source}","${r.location}","${r.budget || ''}","${r.status}","${r.created_at}","${r.assigned_caller}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads_export.csv"');
    res.status(200).send(csvContent);
  });
});

app.get('/api/analytics/:broker_id', (req, res) => {
  const brokerId = req.params.broker_id;
  const stats = { total: 0, hot: 0, connected: 0, failed: 0, unassigned: 0 };

  db.all(`SELECT status, COUNT(*) as count FROM Leads WHERE broker_id = ? GROUP BY status`, [brokerId], (err, rows) => {
    if (rows) {
      rows.forEach(r => {
        stats.total += r.count;
        if (r.status === 'Top-Notch') stats.hot += r.count;
        if (r.status === 'Connected') stats.connected += r.count;
        if (r.status === 'Failed') stats.failed += r.count;
        if (r.status === 'Unassigned') stats.unassigned += r.count;
      });
    }
    res.json(stats);
  });
});

app.get('/api/leads/caller/:caller_id', (req, res) => {
  const callerId = req.params.caller_id;
  db.all(
    `SELECT * FROM Leads WHERE caller_id = ? OR status = 'Unassigned' ORDER BY created_at DESC`,
    [callerId],
    (err, rows) => res.json(rows || [])
  );
});

app.post('/api/leads/update-status', (req, res) => {
  const { lead_id, status, caller_id } = req.body;
  db.run(
    `UPDATE Leads SET status = ?, caller_id = COALESCE(caller_id, ?) WHERE id = ?`,
    [status, caller_id, lead_id],
    (err) => res.json({ status: 'success' })
  );
});

app.post('/api/leads/add-manual', (req, res) => {
  const { broker_id, client_name, client_phone, source, location, budget, intent, caller_id } = req.body;
  const leadId = 'lead_' + Date.now();

  if (caller_id) {
    db.run(
      `INSERT INTO Leads (id, broker_id, caller_id, client_name, client_phone, source, budget, location, intent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Assigned')`,
      [leadId, broker_id, caller_id, client_name, client_phone, source, budget, location, intent],
      (err) => res.json({ status: 'success', lead_id: leadId })
    );
  } else {
    autoAssignLead(broker_id, location, (assignedCallerId, initialStatus) => {
      db.run(
        `INSERT INTO Leads (id, broker_id, caller_id, client_name, client_phone, source, budget, location, intent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [leadId, broker_id, assignedCallerId, client_name, client_phone, source, budget, location, intent, initialStatus],
        (err) => res.json({ status: 'success', lead_id: leadId, assigned_to: assignedCallerId })
      );
    });
  }
});

app.post('/api/leads/delete', (req, res) => {
  db.run(`DELETE FROM Leads WHERE id = ?`, [req.body.id], (err) => res.json({ status: 'success' }));
});

// FRONTEND DASHBOARD
app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Real Estate CRM Engine</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  </head>
  <body class="bg-gray-100 font-sans text-base">
    <div id="app" class="min-h-screen pb-12">
      <nav class="bg-indigo-900 text-white p-4 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-3 sticky top-0 z-40">
        <h1 class="text-2xl font-black flex items-center gap-2">
          <i class="fa-solid fa-building-user text-amber-400"></i> PropFlow CRM
        </h1>
        <div class="flex gap-2 w-full sm:w-auto overflow-x-auto">
          <button @click="currentTab = 'analytics'" :class="currentTab === 'analytics' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-indigo-800 text-white'" class="px-4 py-2.5 rounded-xl font-bold transition">
            📊 Analytics
          </button>
          <button @click="currentTab = 'broker'" :class="currentTab === 'broker' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-indigo-800 text-white'" class="px-4 py-2.5 rounded-xl font-bold transition">
            Broker Profile
          </button>
          <button @click="currentTab = 'callers'" :class="currentTab === 'callers' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-indigo-800 text-white'" class="px-4 py-2.5 rounded-xl font-bold transition">
            Telecallers Form
          </button>
          <button @click="currentTab = 'leads'" :class="currentTab === 'leads' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-indigo-800 text-white'" class="px-4 py-2.5 rounded-xl font-bold transition">
            Leads Admin
          </button>
          <button @click="currentTab = 'dialer'" :class="currentTab === 'dialer' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-emerald-600 text-white'" class="px-4 py-2.5 rounded-xl font-bold transition">
            <i class="fa-solid fa-phone"></i> Dialer Screen
          </button>
        </div>
      </nav>

      <div class="p-4 max-w-5xl mx-auto mt-4">

        <!-- ANALYTICS DASHBOARD -->
        <div v-if="currentTab === 'analytics'" class="space-y-6">
          <h2 class="text-xl font-black text-gray-900 flex items-center gap-2">
            <i class="fa-solid fa-chart-line text-indigo-600"></i> Performance Dashboard
          </h2>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-2xl shadow border border-indigo-100">
              <p class="text-xs font-bold text-gray-500 uppercase">Total Leads</p>
              <h3 class="text-3xl font-black text-indigo-950 mt-1">{{ stats.total }}</h3>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow border border-amber-100">
              <p class="text-xs font-bold text-amber-600 uppercase">⭐ Hot Leads</p>
              <h3 class="text-3xl font-black text-amber-500 mt-1">{{ stats.hot }}</h3>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow border border-blue-100">
              <p class="text-xs font-bold text-blue-600 uppercase">Connected</p>
              <h3 class="text-3xl font-black text-blue-600 mt-1">{{ stats.connected }}</h3>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow border border-rose-100">
              <p class="text-xs font-bold text-rose-600 uppercase">Failed / Unreachable</p>
              <h3 class="text-3xl font-black text-rose-600 mt-1">{{ stats.failed }}</h3>
            </div>
          </div>
        </div>
        
        <!-- BROKER PROFILE -->
        <div v-if="currentTab === 'broker'" class="bg-white p-6 rounded-2xl shadow-md border space-y-4">
          <h2 class="text-xl font-black text-gray-900 border-b pb-2"><i class="fa-solid fa-id-card text-indigo-600"></i> Broker Profile Settings</h2>
          <form @submit.prevent="saveBroker" class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Company / Agency Name</label>
              <input v-model="broker.company_name" type="text" required class="w-full p-3 border rounded-xl font-semibold">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Official Email</label>
                <input v-model="broker.email" type="email" required class="w-full p-3 border rounded-xl font-semibold">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Contact Phone</label>
                <input v-model="broker.phone" type="text" required class="w-full p-3 border rounded-xl font-semibold">
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Target Locations (Comma Separated)</label>
              <input v-model="broker.target_locations" type="text" placeholder="e.g. Noida, Delhi, Gurgaon" class="w-full p-3 border rounded-xl font-semibold">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Budget Brackets (Comma Separated)</label>
              <input v-model="broker.budget_brackets" type="text" placeholder="e.g. Under 50L, 50L-1Cr, 1Cr+" class="w-full p-3 border rounded-xl font-semibold">
            </div>
            <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-black text-lg shadow">
              Save Profile
            </button>
          </form>
        </div>

        <!-- TELECALLERS FORM -->
        <div v-if="currentTab === 'callers'" class="space-y-6">
          <div class="bg-white p-6 rounded-2xl shadow-md border space-y-4">
            <h2 class="text-xl font-black text-gray-900 border-b pb-2"><i class="fa-solid fa-user-plus text-emerald-600"></i> Add New Telecaller</h2>
            <form @submit.prevent="addCaller" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Full Name</label>
                  <input v-model="newCaller.name" type="text" placeholder="e.g. Amit Kumar" required class="w-full p-3 border rounded-xl font-semibold">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Email</label>
                  <input v-model="newCaller.email" type="email" placeholder="amit@agency.com" required class="w-full p-3 border rounded-xl font-semibold">
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Phone Number</label>
                  <input v-model="newCaller.phone" type="text" placeholder="+91 9876543210" required class="w-full p-3 border rounded-xl font-semibold">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Location Specialization</label>
                  <input v-model="newCaller.location_specialization" type="text" placeholder="e.g. Noida" required class="w-full p-3 border rounded-xl font-semibold">
                </div>
              </div>
              <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-black text-lg shadow">
                Add Telecaller
              </button>
            </form>
          </div>

          <div class="bg-white p-6 rounded-2xl shadow-md border">
            <h3 class="text-lg font-black text-gray-900 mb-3">Team Members ({{ telecallers.length }})</h3>
            <div class="divide-y">
              <div v-for="c in telecallers" :key="c.id" class="py-3 flex justify-between items-center">
                <div>
                  <p class="font-black text-gray-900">{{ c.name }} <span class="text-xs bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded ml-2">{{ c.location_specialization }}</span></p>
                  <p class="text-xs text-gray-500">{{ c.email }} | {{ c.phone }}</p>
                </div>
                <button @click="deleteCaller(c.id)" class="text-rose-600 hover:bg-rose-50 p-2 rounded-lg font-bold text-sm">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- LEADS MANAGEMENT WITH CSV EXPORT -->
        <div v-if="currentTab === 'leads'" class="space-y-6">
          <div class="bg-white p-6 rounded-2xl shadow-md border space-y-4">
            <h2 class="text-xl font-black text-gray-900 border-b pb-2"><i class="fa-solid fa-address-book text-amber-500"></i> Add Client / Lead Entry</h2>
            <form @submit.prevent="addLead" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Client Name</label>
                  <input v-model="newLead.client_name" type="text" placeholder="e.g. Rajesh Sharma" required class="w-full p-3 border rounded-xl font-semibold">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Client Phone</label>
                  <input v-model="newLead.client_phone" type="text" placeholder="+91 9999988888" required class="w-full p-3 border rounded-xl font-semibold">
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Lead Source</label>
                  <select v-model="newLead.source" class="w-full p-3 border rounded-xl font-semibold bg-white">
                    <option value="Meta Ads">Meta / FB Ads</option>
                    <option value="Google Ads">Google Ads</option>
                    <option value="Website">Website Form</option>
                    <option value="Direct Call">Direct Call</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Location</label>
                  <input v-model="newLead.location" type="text" placeholder="e.g. Noida" required class="w-full p-3 border rounded-xl font-semibold">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Budget</label>
                  <input v-model="newLead.budget" type="text" placeholder="e.g. 75 Lakhs" class="w-full p-3 border rounded-xl font-semibold">
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Assign Telecaller</label>
                <select v-model="newLead.caller_id" class="w-full p-3 border rounded-xl font-semibold bg-white">
                  <option value="">⚡ Auto-Assign Based on Location</option>
                  <option v-for="c in telecallers" :key="c.id" :value="c.id">{{ c.name }} ({{ c.location_specialization }})</option>
                </select>
              </div>
              <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-white py-3.5 rounded-xl font-black text-lg shadow">
                Save & Add Lead
              </button>
            </form>
          </div>

          <div class="bg-white p-6 rounded-2xl shadow-md border">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-black text-gray-900">All Recorded Leads ({{ leads.length }})</h3>
              <a href="/api/leads/export/b101" download class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow">
                <i class="fa-solid fa-file-csv"></i> Download CSV
              </a>
            </div>

            <div class="divide-y overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="bg-gray-50 text-gray-600 uppercase text-xs">
                    <th class="p-2">Client / Phone</th>
                    <th class="p-2">Location</th>
                    <th class="p-2">Assigned Telecaller</th>
                    <th class="p-2">Status</th>
                    <th class="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="l in leads" :key="l.id" class="border-b">
                    <td class="p-2"><strong>{{ l.client_name }}</strong><br><span class="text-xs text-gray-500">{{ l.client_phone }}</span></td>
                    <td class="p-2">{{ l.location }}</td>
                    <td class="p-2"><span class="font-bold text-indigo-950">{{ l.caller_name || 'Unassigned (Pool)' }}</span></td>
                    <td class="p-2"><span class="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded text-xs">{{ l.status }}</span></td>
                    <td class="p-2">
                      <button @click="deleteLead(l.id)" class="text-rose-600 hover:bg-rose-50 p-1.5 rounded font-bold">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TELECALLER DIALER DASHBOARD -->
        <div v-if="currentTab === 'dialer'" class="space-y-6">
          <div class="bg-white p-6 rounded-2xl shadow-md border space-y-4">
            <h2 class="text-xl font-black text-gray-900 border-b pb-2 flex justify-between items-center">
              <span><i class="fa-solid fa-headset text-emerald-600"></i> Telecaller Dialer Screen</span>
            </h2>
            
            <div>
              <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Select Telecaller Profile</label>
              <select v-model="selectedCallerId" @change="loadCallerLeads" class="w-full p-3 border rounded-xl font-bold bg-emerald-50 text-emerald-950">
                <option value="">-- Choose Active Telecaller --</option>
                <option v-for="c in telecallers" :key="c.id" :value="c.id">{{ c.name }} ({{ c.location_specialization }})</option>
              </select>
            </div>
          </div>

          <div v-if="selectedCallerId" class="space-y-4">
            <h3 class="text-lg font-black text-gray-900">Leads Assigned & Open Pool ({{ callerLeads.length }})</h3>
            
            <div v-for="l in callerLeads" :key="l.id" class="bg-white p-5 rounded-2xl shadow border space-y-3">
              <div class="flex justify-between items-start">
                <div>
                  <h4 class="text-lg font-black text-gray-900">{{ l.client_name }}</h4>
                  <p class="text-sm font-semibold text-gray-500"><i class="fa-solid fa-location-dot text-rose-500"></i> {{ l.location }} | Budget: {{ l.budget || 'N/A' }}</p>
                  <p class="text-xs text-indigo-600 font-bold mt-1">Source: {{ l.source }}</p>
                </div>
                <span :class="{
                  'bg-amber-100 text-amber-800': l.status === 'Unassigned',
                  'bg-blue-100 text-blue-800': l.status === 'Assigned',
                  'bg-emerald-100 text-emerald-800': l.status === 'Connected' || l.status === 'Top-Notch',
                  'bg-rose-100 text-rose-800': l.status === 'Failed'
                }" class="font-bold px-3 py-1 rounded-full text-xs">
                  {{ l.status }}
                </span>
              </div>

              <div class="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                <a :href="'tel:' + l.client_phone" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded-xl font-black text-base shadow flex items-center justify-center gap-2">
                  <i class="fa-solid fa-phone-volume"></i> Call {{ l.client_phone }}
                </a>
                
                <div class="flex gap-2 flex-1">
                  <button @click="updateStatus(l.id, 'Connected')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-xs">
                    Connected
                  </button>
                  <button @click="updateStatus(l.id, 'Top-Notch')" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold text-xs">
                    ⭐ Hot Lead
                  </button>
                  <button @click="updateStatus(l.id, 'Failed')" class="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-xs">
                    Failed
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <script>
      const { createApp } = Vue;
      createApp({
        data() {
          return {
            currentTab: 'analytics',
            broker: { company_name: '', email: '', phone: '', target_locations: '', budget_brackets: '' },
            telecallers: [],
            leads: [],
            stats: { total: 0, hot: 0, connected: 0, failed: 0, unassigned: 0 },
            selectedCallerId: '',
            callerLeads: [],
            newCaller: { name: '', email: '', phone: '', location_specialization: '' },
            newLead: { client_name: '', client_phone: '', source: 'Meta Ads', location: '', budget: '', caller_id: '' }
          }
        },
        async mounted() {
          await this.loadBroker();
          await this.loadTelecallers();
          await this.loadLeads();
          await this.loadStats();
        },
        methods: {
          async loadStats() {
            const res = await fetch('/api/analytics/b101');
            this.stats = await res.json();
          },
          async loadBroker() {
            const res = await fetch('/api/broker/b101');
            this.broker = await res.json();
          },
          async saveBroker() {
            await fetch('/api/broker/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ broker_id: 'b101', ...this.broker })
            });
            alert('Broker Profile Updated!');
          },
          async loadTelecallers() {
            const res = await fetch('/api/telecallers/b101');
            this.telecallers = await res.json();
          },
          async addCaller() {
            await fetch('/api/telecallers/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ broker_id: 'b101', ...this.newCaller })
            });
            this.newCaller = { name: '', email: '', phone: '', location_specialization: '' };
            await this.loadTelecallers();
            alert('Telecaller Added!');
          },
          async deleteCaller(id) {
            if(!confirm('Delete this telecaller?')) return;
            await fetch('/api/telecallers/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
            });
            await this.loadTelecallers();
          },
          async loadLeads() {
            const res = await fetch('/api/leads/all/b101');
            this.leads = await res.json();
          },
          async addLead() {
            await fetch('/api/leads/add-manual', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ broker_id: 'b101', ...this.newLead })
            });
            this.newLead = { client_name: '', client_phone: '', source: 'Meta Ads', location: '', budget: '', caller_id: '' };
            await this.loadLeads();
            await this.loadStats();
            alert('New Lead Added & Auto-Routed!');
          },
          async deleteLead(id) {
            if(!confirm('Delete this lead entry?')) return;
            await fetch('/api/leads/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
            });
            await this.loadLeads();
            await this.loadStats();
          },
          async loadCallerLeads() {
            if(!this.selectedCallerId) return;
            const res = await fetch('/api/leads/caller/' + this.selectedCallerId);
            this.callerLeads = await res.json();
          },
          async updateStatus(leadId, status) {
            await fetch('/api/leads/update-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lead_id: leadId, status: status, caller_id: this.selectedCallerId })
            });
            await this.loadCallerLeads();
            await this.loadLeads();
            await this.loadStats();
          }
        }
      }).mount('#app');
    </script>
  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
