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

// ================= HELPER: AUTOMATIC LEAD ROUTING LOGIC =================
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

// ================= STEP 1 & 2: META ADS WEBHOOK WITH AUTO-ASSIGNMENT =================

app.get('/api/webhooks/meta', (req, res) => {
  const VERIFY_TOKEN = 'my_crm_secret_token_123';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
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

          // STEP 2 AUTOMATIC ASSIGNMENT
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
              ],
              (err) => {
                if (!err) console.log(`Meta Lead Auto-Assigned to Caller: ${assignedCallerId || 'Pool'}`);
              }
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

// ================= SYSTEM API ENDPOINTS =================

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
    (err) => {
      if(err) return res.status(500).json({ error: err.message });
      res.json({ status: 'success', caller_id: callerId });
    }
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

app.post('/api/leads/add-manual', (req, res) => {
  const { broker_id, client_name, client_phone, source, location, budget, intent, caller_id } = req.body;
  const leadId = 'lead_' + Date.now();

  if (caller_id) {
    // Manually Assigned
    db.run(
      `INSERT INTO Leads (id, broker_id, caller_id, client_name, client_phone, source, budget, location, intent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Assigned')`,
      [leadId, broker_id, caller_id, client_name, client_phone, source, budget, location, intent],
      (err) => res.json({ status: 'success', lead_id: leadId })
    );
  } else {
    // STEP 2 AUTO ASSIGNMENT LOGIC
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

// ================= FRONTEND DASHBOARD =================

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
        <div class="flex gap-2 w-full sm:w-auto">
          <button @click="currentTab = 'broker'" :class="currentTab === 'broker' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-indigo-800 text-white'" class="flex-1 px-4 py-2.5 rounded-xl font-bold transition">
            Broker Profile
          </button>
          <button @click="currentTab = 'callers'" :class="currentTab === 'callers' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-indigo-800 text-white'" class="flex-1 px-4 py-2.5 rounded-xl font-bold transition">
            Telecallers
          </button>
          <button @click="currentTab = 'leads'" :class="currentTab === 'leads' ? 'bg-amber-400 text-indigo-950 font-black' : 'bg-indigo-800 text-white'" class="flex-1 px-4 py-2.5 rounded-xl font-bold transition">
            Leads Management
          </button>
        </div>
      </nav>

      <div class="p-4 max-w-5xl mx-auto mt-4">
        
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

        <!-- TELECALLERS -->
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

        <!-- LEADS MANAGEMENT -->
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
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Assign Telecaller (Leave Blank for Auto-Routing)</label>
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
            <h3 class="text-lg font-black text-gray-900 mb-3">All Recorded Leads ({{ leads.length }})</h3>
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

      </div>
    </div>

    <script>
      const { createApp } = Vue;
      createApp({
        data() {
          return {
            currentTab: 'broker',
            broker: { company_name: '', email: '', phone: '', target_locations: '', budget_brackets: '' },
            telecallers: [],
            leads: [],
            newCaller: { name: '', email: '', phone: '', location_specialization: '' },
            newLead: { client_name: '', client_phone: '', source: 'Meta Ads', location: '', budget: '', caller_id: '' }
          }
        },
        async mounted() {
          await this.loadBroker();
          await this.loadTelecallers();
          await this.loadLeads();
        },
        methods: {
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
