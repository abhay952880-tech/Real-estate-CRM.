const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS Brokers (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      target_locations TEXT,
      budget_brackets TEXT,
      cloud_call_recording BOOLEAN DEFAULT 0
    )
  `);

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

  const brokerId = 'b101';
  db.run(`INSERT INTO Brokers VALUES ('${brokerId}', 'Apex Properties', 'admin@apex.com', '+919876543210', 'Noida,Delhi,Gurgaon', 'Below 50L,50L-1Cr,1Cr+', 1)`);
  db.run(`INSERT INTO Telecallers VALUES ('c201', '${brokerId}', 'Rahul Sharma', 'rahul@apex.com', '+919811111111', 'Noida')`);
  db.run(`INSERT INTO Telecallers VALUES ('c202', '${brokerId}', 'Priya Singh', 'priya@apex.com', '+919822222222', 'Delhi')`);
});

app.post('/api/webhooks/incoming-lead', (req, res) => {
  const { broker_id, client_name, client_phone, source, location, budget, intent } = req.body;
  if (!broker_id || !client_name || !client_phone || !location) {
    return res.status(400).json({ status: 'error', message: 'Missing essential fields.' });
  }
  const leadId = 'lead_' + crypto.randomBytes(4).toString('hex');
  db.get(
    `SELECT id FROM Telecallers WHERE broker_id = ? AND LOWER(location_specialization) = LOWER(?) LIMIT 1`,
    [broker_id, location],
    (err, caller) => {
      let assignedCallerId = caller ? caller.id : null;
      let initialStatus = caller ? 'Assigned' : 'Unassigned';

      db.run(
        `INSERT INTO Leads (id, broker_id, caller_id, client_name, client_phone, source, budget, location, intent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [leadId, broker_id, assignedCallerId, client_name, client_phone, source || 'Meta Ads', budget, location, intent, initialStatus],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({ status: 'success', lead_id: leadId, assigned_caller: assignedCallerId || 'Marketplace Pool' });
        }
      );
    }
  );
});

app.post('/api/leads/claim', (req, res) => {
  const { lead_id, caller_id } = req.body;
  db.get(`SELECT status FROM Leads WHERE id = ?`, [lead_id], (err, lead) => {
    if (!lead || lead.status !== 'Unassigned') {
      return res.status(400).json({ status: 'failed', message: 'Lead unavailable.' });
    }
    db.run(`UPDATE Leads SET caller_id = ?, status = 'Assigned' WHERE id = ?`, [caller_id, lead_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'success', message: 'Lead claimed.' });
    });
  });
});

app.post('/api/leads/sync-chatbot', (req, res) => {
  const { lead_id, budget, location, intent } = req.body;
  db.run(
    `UPDATE Leads SET budget = COALESCE(?, budget), location = COALESCE(?, location), intent = COALESCE(?, intent) WHERE id = ?`,
    [budget, location, intent, lead_id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'success' });
    }
  );
});

app.get('/api/broker/:id', (req, res) => {
  db.get(`SELECT * FROM Brokers WHERE id = ?`, [req.params.id], (err, broker) => res.json(broker));
});

app.post('/api/broker/update', (req, res) => {
  const { broker_id, target_locations, budget_brackets, cloud_call_recording } = req.body;
  db.run(
    `UPDATE Brokers SET target_locations = ?, budget_brackets = ?, cloud_call_recording = ? WHERE id = ?`,
    [target_locations, budget_brackets, cloud_call_recording ? 1 : 0, broker_id],
    (err) => res.json({ status: 'success' })
  );
});

app.get('/api/telecallers/:broker_id', (req, res) => {
  db.all(`SELECT * FROM Telecallers WHERE broker_id = ?`, [req.params.broker_id], (err, rows) => res.json(rows));
});

app.post('/api/telecallers/add', (req, res) => {
  const { broker_id, name, email, phone, location_specialization } = req.body;
  const callerId = 'c' + Date.now();
  db.run(
    `INSERT INTO Telecallers VALUES (?, ?, ?, ?, ?, ?)`,
    [callerId, broker_id, name, email, phone, location_specialization],
    (err) => res.json({ status: 'success', caller_id: callerId })
  );
});

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
  db.all(query, [req.params.broker_id], (err, rows) => res.json(rows));
});

app.get('/api/leads/caller/:caller_id', (req, res) => {
  db.all(`SELECT * FROM Leads WHERE caller_id = ? ORDER BY created_at DESC`, [req.params.caller_id], (err, rows) => res.json(rows));
});

app.get('/api/leads/unassigned/:broker_id', (req, res) => {
  db.all(`SELECT * FROM Leads WHERE broker_id = ? AND status = 'Unassigned'`, [req.params.broker_id], (err, rows) => res.json(rows));
});

app.post('/api/leads/update-status', (req, res) => {
  const { lead_id, status } = req.body;
  const mockAudioUrl = status === 'Connected' || status === 'Top-Notch' ? 'https://www.w3schools.com/html/horse.mp3' : null;
  db.run(`UPDATE Leads SET status = ?, recording_url = COALESCE(?, recording_url) WHERE id = ?`, [status, mockAudioUrl, lead_id], (err) => res.json({ status: 'success' }));
});

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
  <body class="bg-gray-100 font-sans">
    <div id="app" class="min-h-screen">
      <nav class="bg-indigo-900 text-white p-4 shadow-lg flex justify-between items-center">
        <h1 class="text-xl font-bold flex items-center gap-2">
          <i class="fa-solid fa-building-user text-amber-400"></i> PropFlow CRM
        </h1>
        <div class="flex gap-2">
          <button @click="currentView = 'admin'" :class="{'bg-indigo-700': currentView === 'admin'}" class="px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-800 transition">Broker Admin</button>
          <button @click="currentView = 'caller'" :class="{'bg-indigo-700': currentView === 'caller'}" class="px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-800 transition">Caller Dashboard</button>
        </div>
      </nav>

      <div v-if="currentView === 'admin'" class="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-800">Broker Control Center</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2"><i class="fa-solid fa-sliders text-indigo-600"></i> Multi-Tenant Settings</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase">Target Locations (CSV)</label>
                <input v-model="broker.target_locations" type="text" class="w-full mt-1 p-2 border rounded-md text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase">Budget Brackets (CSV)</label>
                <input v-model="broker.budget_brackets" type="text" class="w-full mt-1 p-2 border rounded-md text-sm">
              </div>
              <div class="flex items-center justify-between pt-2">
                <span class="text-sm font-semibold text-gray-700">Enable Cloud Call Recording</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" v-model="broker.cloud_call_recording" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <button @click="saveBrokerSettings" class="w-full bg-indigo-600 text-white py-2 rounded-md font-semibold text-sm hover:bg-indigo-700 transition">Save Configuration</button>
            </div>
          </div>

          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2"><i class="fa-solid fa-user-plus text-indigo-600"></i> Add Telecaller</h3>
            <form @submit.prevent="addTelecaller" class="space-y-3">
              <input v-model="newCaller.name" type="text" placeholder="Full Name" required class="w-full p-2 border rounded-md text-sm">
              <input v-model="newCaller.email" type="email" placeholder="Email Address" required class="w-full p-2 border rounded-md text-sm">
              <input v-model="newCaller.phone" type="text" placeholder="Phone Number" required class="w-full p-2 border rounded-md text-sm">
              <select v-model="newCaller.location_specialization" required class="w-full p-2 border rounded-md text-sm bg-white">
                <option value="" disabled>Select Location Specialization</option>
                <option v-for="loc in locationsList" :key="loc" :value="loc.trim()">{{ loc.trim() }}</option>
              </select>
              <button type="submit" class="w-full bg-emerald-600 text-white py-2 rounded-md font-semibold text-sm hover:bg-emerald-700 transition">Add Caller</button>
            </form>
          </div>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2"><i class="fa-solid fa-chart-line text-indigo-600"></i> Live Telecaller Performance</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-50 text-gray-600 text-xs uppercase border-b">
                  <th class="p-3">Caller</th>
                  <th class="p-3">Total Assigned</th>
                  <th class="p-3">Connected</th>
                  <th class="p-3">Failed</th>
                  <th class="p-3">Top-Notch ⭐</th>
                </tr>
              </thead>
              <tbody class="divide-y text-sm">
                <tr v-for="row in leaderboard" :key="row.caller_id">
                  <td class="p-3 font-semibold text-gray-800">{{ row.name }}</td>
                  <td class="p-3"><span class="bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded">{{ row.total_assigned }}</span></td>
                  <td class="p-3"><span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded">{{ row.connected }}</span></td>
                  <td class="p-3"><span class="bg-rose-100 text-rose-800 font-bold px-2 py-1 rounded">{{ row.failed }}</span></td>
                  <td class="p-3"><span class="bg-amber-100 text-amber-800 font-bold px-2 py-1 rounded">{{ row.top_notch }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="currentView === 'caller'" class="p-4 max-w-md mx-auto space-y-4">
        <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
          <span class="text-xs font-bold text-gray-500 uppercase">Active Agent:</span>
          <select v-model="activeCallerId" @change="loadCallerData" class="font-bold text-indigo-900 bg-transparent text-sm focus:outline-none">
            <option v-for="c in telecallers" :key="c.id" :value="c.id">{{ c.name }} ({{ c.location_specialization }})</option>
          </select>
        </div>

        <div v-if="unassignedLeads.length > 0" class="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <h3 class="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2"><i class="fa-solid fa-bell"></i> Open Marketplace Leads</h3>
          <div v-for="lead in unassignedLeads" :key="lead.id" class="bg-white p-3 rounded-lg border border-amber-300 flex justify-between items-center mb-2">
            <div>
              <p class="font-bold text-sm text-gray-800">{{ lead.client_name }}</p>
              <p class="text-xs text-gray-500">{{ lead.location }} | {{ lead.budget }}</p>
            </div>
            <button @click="claimLead(lead.id)" class="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-3 py-1.5 rounded-md transition shadow-sm">Claim</button>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2">
          <h2 class="text-lg font-bold text-gray-800">Assigned Leads ({{ assignedLeads.length }})</h2>
          <button @click="simulateIncomingLead" class="text-xs bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded border border-indigo-200">+ Simulate Lead</button>
        </div>

        <div v-if="assignedLeads.length === 0" class="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed">
          No leads assigned yet.
        </div>

        <div v-for="lead in assignedLeads" :key="lead.id" class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="font-bold text-gray-900 text-base">{{ lead.client_name }}</h3>
              <span class="text-[10px] bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded uppercase">{{ lead.source }}</span>
            </div>
            <span :class="getStatusBadgeClass(lead.status)" class="text-xs font-bold px-2.5 py-1 rounded-full">
              {{ lead.status }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg">
            <div><strong class="text-gray-900">Budget:</strong> {{ lead.budget || 'N/A' }}</div>
            <div><strong class="text-gray-900">Location:</strong> {{ lead.location }}</div>
            <div class="col-span-2" v-if="lead.intent"><strong class="text-gray-900">Intent:</strong> {{ lead.intent }}</div>
          </div>

          <div v-if="broker.cloud_call_recording && lead.recording_url" class="bg-indigo-50 p-2 rounded-lg flex items-center justify-between">
            <span class="text-xs font-semibold text-indigo-900"><i class="fa-solid fa-microphone"></i> Recording:</span>
            <audio controls class="h-6 w-48">
              <source :src="lead.recording_url" type="audio/mpeg">
            </audio>
          </div>

          <button @click="triggerCallSimulation(lead)" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm active:scale-95 transition">
            <i class="fa-solid fa-phone"></i> Click-to-Call ({{ lead.client_phone }})
          </button>
        </div>

        <div v-if="activeCallLead" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div class="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 space-y-4 shadow-2xl animate-bounce-in">
            <h3 class="text-center font-bold text-gray-800 text-lg">Call Completed</h3>
            <p class="text-center text-xs text-gray-500">Update outcome for <strong>{{ activeCallLead.client_name }}</strong>:</p>
            <div class="space-y-2.5 pt-2">
              <button @click="submitDisposition('Connected')" class="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold py-3 rounded-xl border border-emerald-300 flex items-center justify-center gap-2">🟢 Connected</button>
              <button @click="submitDisposition('Failed')" class="w-full bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold py-3 rounded-xl border border-rose-300 flex items-center justify-center gap-2">🔴 Failed / Wrong Number</button>
              <button @click="submitDisposition('Top-Notch')" class="w-full bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold py-3 rounded-xl border border-amber-300 flex items-center justify-center gap-2">⭐ Top-Notch (HOT Lead)</button>
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
            currentView: 'admin',
            broker: { target_locations: '', budget_brackets: '', cloud_call_recording: 1 },
            telecallers: [],
            newCaller: { name: '', email: '', phone: '', location_specialization: '' },
            leaderboard: [],
            activeCallerId: 'c201',
            assignedLeads: [],
            unassignedLeads: [],
            activeCallLead: null
          }
        },
        computed: {
          locationsList() {
            return this.broker.target_locations ? this.broker.target_locations.split(',') : [];
          }
        },
        async mounted() {
          await this.loadBrokerData();
          await this.loadTelecallers();
          await this.loadLeaderboard();
          await this.loadCallerData();
        },
        methods: {
          async loadBrokerData() {
            const res = await fetch('/api/broker/b101');
            this.broker = await res.json();
          },
          async saveBrokerSettings() {
            await fetch('/api/broker/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ broker_id: 'b101', ...this.broker })
            });
            alert('Settings Saved!');
          },
          async loadTelecallers() {
            const res = await fetch('/api/telecallers/b101');
            this.telecallers = await res.json();
          },
          async addTelecaller() {
            await fetch('/api/telecallers/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ broker_id: 'b101', ...this.newCaller })
            });
            this.newCaller = { name: '', email: '', phone: '', location_specialization: '' };
            await this.loadTelecallers();
            await this.loadLeaderboard();
          },
          async loadLeaderboard() {
            const res = await fetch('/api/analytics/leaderboard/b101');
            this.leaderboard = await res.json();
          },
          async loadCallerData() {
            const resLeads = await fetch(\`/api/leads/caller/\${this.activeCallerId}\`);
            this.assignedLeads = await resLeads.json();
            const resUnassigned = await fetch('/api/leads/unassigned/b101');
            this.unassignedLeads = await resUnassigned.json();
          },
          async claimLead(leadId) {
            await fetch('/api/leads/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lead_id: leadId, caller_id: this.activeCallerId })
            });
            await this.loadCallerData();
            await this.loadLeaderboard();
          },
          triggerCallSimulation(lead) {
            window.location.href = \`tel:\${lead.client_phone}\`;
            this.activeCallLead = lead;
          },
          async submitDisposition(status) {
            await fetch('/api/leads/update-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lead_id: this.activeCallLead.id, status })
            });
            this.activeCallLead = null;
            await this.loadCallerData();
            await this.loadLeaderboard();
          },
          getStatusBadgeClass(status) {
            switch(status) {
              case 'Connected': return 'bg-emerald-100 text-emerald-800';
              case 'Failed': return 'bg-rose-100 text-rose-800';
              case 'Top-Notch': return 'bg-amber-100 text-amber-800';
              default: return 'bg-blue-100 text-blue-800';
            }
          },
          async simulateIncomingLead() {
            const sampleLocations = ['Noida', 'Delhi', 'Mumbai'];
            const randomLoc = sampleLocations[Math.floor(Math.random() * sampleLocations.length)];
            await fetch('/api/webhooks/incoming-lead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                broker_id: 'b101',
                client_name: 'Test Client ' + Math.floor(Math.random()*100),
                client_phone: '+9199999' + Math.floor(10000 + Math.random()*90000),
                source: 'Facebook Ads',
                location: randomLoc,
                budget: '50L-1Cr',
                intent: 'Immediate Buying'
              })
            });
            await this.loadCallerData();
            await this.loadLeaderboard();
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
