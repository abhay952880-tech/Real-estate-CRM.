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
  <body class="bg-gray-100 font-sans text-base">
    <div id="app" class="min-h-screen pb-10">
      <nav class="bg-indigo-900 text-white p-4 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-3 sticky top-0 z-40">
        <h1 class="text-2xl font-black flex items-center gap-2 tracking-wide">
          <i class="fa-solid fa-building-user text-amber-400"></i> PropFlow CRM
        </h1>
        <div class="flex gap-2 w-full sm:w-auto">
          <button @click="currentView = 'admin'" :class="currentView === 'admin' ? 'bg-amber-400 text-indigo-950 font-black scale-105 shadow' : 'bg-indigo-800 text-white font-semibold opacity-90'" class="flex-1 sm:flex-none px-5 py-3 rounded-xl text-base transition-all duration-200 border-2 border-amber-400/40">
            <i class="fa-solid fa-user-shield mr-1"></i> Broker Admin
          </button>
          <button @click="currentView = 'caller'" :class="currentView === 'caller' ? 'bg-amber-400 text-indigo-950 font-black scale-105 shadow' : 'bg-indigo-800 text-white font-semibold opacity-90'" class="flex-1 sm:flex-none px-5 py-3 rounded-xl text-base transition-all duration-200 border-2 border-amber-400/40">
            <i class="fa-solid fa-headset mr-1"></i> Telecaller
          </button>
        </div>
      </nav>

      <div v-if="currentView === 'admin'" class="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div class="bg-indigo-50 border-l-4 border-indigo-600 p-4 rounded-r-xl shadow-sm">
          <h2 class="text-2xl font-black text-indigo-950">Broker Admin Dashboard</h2>
          <p class="text-sm text-indigo-700 font-medium mt-0.5">Manage system settings and telecallers</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-2xl shadow-md border border-gray-200 space-y-5">
            <h3 class="text-xl font-extrabold text-gray-900 flex items-center gap-2 border-b pb-3">
              <i class="fa-solid fa-sliders text-indigo-600"></i> Multi-Tenant Settings
            </h3>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Target Locations (CSV)</label>
                <input v-model="broker.target_locations" type="text" class="w-full p-3.5 border-2 border-gray-300 rounded-xl font-medium focus:border-indigo-600 focus:outline-none text-base">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Budget Brackets (CSV)</label>
                <input v-model="broker.budget_brackets" type="text" class="w-full p-3.5 border-2 border-gray-300 rounded-xl font-medium focus:border-indigo-600 focus:outline-none text-base">
              </div>
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl border">
                <span class="text-sm font-bold text-gray-800">Enable Call Recording</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" v-model="broker.cloud_call_recording" class="sr-only peer">
                  <div class="w-12 h-7 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <button @click="saveBrokerSettings" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-black text-lg shadow-lg active:scale-95 transition-all">
                Save Configuration
              </button>
            </div>
          </div>

          <div class="bg-white p-6 rounded-2xl shadow-md border border-gray-200 space-y-5">
            <h3 class="text-xl font-extrabold text-gray-900 flex items-center gap-2 border-b pb-3">
              <i class="fa-solid fa-user-plus text-emerald-600"></i> Add Telecaller
            </h3>
            <form @submit.prevent="addTelecaller" class="space-y-3.5">
              <input v-model="newCaller.name" type="text" placeholder="Full Name" required class="w-full p-3.5 border-2 border-gray-300 rounded-xl font-medium text-base">
              <input v-model="newCaller.email" type="email" placeholder="Email Address" required class="w-full p-3.5 border-2 border-gray-300 rounded-xl font-medium text-base">
              <input v-model="newCaller.phone" type="text" placeholder="Phone Number" required class="w-full p-3.5 border-2 border-gray-300 rounded-xl font-medium text-base">
              <select v-model="newCaller.location_specialization" required class="w-full p-3.5 border-2 border-gray-300 rounded-xl font-semibold text-base bg-white">
                <option value="" disabled>Select Location Specialization</option>
                <option v-for="loc in locationsList" :key="loc" :value="loc.trim()">{{ loc.trim() }}</option>
              </select>
              <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-black text-lg shadow-lg active:scale-95 transition-all">
                Add Caller
              </button>
            </form>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-md border border-gray-200">
          <h3 class="text-xl font-extrabold text-gray-900 mb-4 flex items-center gap-2">
            <i class="fa-solid fa-chart-line text-indigo-600"></i> Live Telecaller Performance
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-100 text-gray-700 text-xs uppercase font-extrabold border-b">
                  <th class="p-3.5">Caller</th>
                  <th class="p-3.5">Assigned</th>
                  <th class="p-3.5">Connected</th>
                  <th class="p-3.5">Failed</th>
                  <th class="p-3.5">Top-Notch ⭐</th>
                </tr>
              </thead>
              <tbody class="divide-y text-base font-semibold">
                <tr v-for="row in leaderboard" :key="row.caller_id">
                  <td class="p-3.5 font-bold text-gray-900">{{ row.name }}</td>
                  <td class="p-3.5"><span class="bg-blue-100 text-blue-900 px-3 py-1 rounded-lg">{{ row.total_assigned }}</span></td>
                  <td class="p-3.5"><span class="bg-emerald-100 text-emerald-900 px-3 py-1 rounded-lg">{{ row.connected }}</span></td>
                  <td class="p-3.5"><span class="bg-rose-100 text-rose-900 px-3 py-1 rounded-lg">{{ row.failed }}</span></td>
                  <td class="p-3.5"><span class="bg-amber-100 text-amber-900 px-3 py-1 rounded-lg">{{ row.top_notch }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="currentView === 'caller'" class="p-4 max-w-lg mx-auto space-y-5">
        <div class="bg-white p-4 rounded-2xl shadow-md border-2 border-indigo-200 flex flex-col gap-1">
          <span class="text-xs font-black text-indigo-600 uppercase tracking-wider">Logged In Agent:</span>
          <select v-model="activeCallerId" @change="loadCallerData" class="font-black text-lg text-indigo-950 bg-transparent focus:outline-none cursor-pointer">
            <option v-for="c in telecallers" :key="c.id" :value="c.id">{{ c.name }} ({{ c.location_specialization }})</option>
          </select>
        </div>

        <div v-if="unassignedLeads.length > 0" class="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl shadow-sm">
          <h3 class="text-sm font-black text-amber-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <i class="fa-solid fa-bell text-amber-600"></i> Open Marketplace Leads
          </h3>
          <div v-for="lead in unassignedLeads" :key="lead.id" class="bg-white p-4 rounded-xl border border-amber-300 flex justify-between items-center mb-2 shadow-sm">
            <div>
              <p class="font-black text-base text-gray-900">{{ lead.client_name }}</p>
              <p class="text-xs font-semibold text-gray-600">{{ lead.location }} | {{ lead.budget }}</p>
            </div>
            <button @click="claimLead(lead.id)" class="bg-amber-500 hover:bg-amber-600 text-white font-black text-sm px-4 py-2.5 rounded-xl transition shadow">Claim</button>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2">
          <h2 class="text-xl font-black text-gray-900">Assigned Leads ({{ assignedLeads.length }})</h2>
          <button @click="simulateIncomingLead" class="text-xs bg-indigo-100 text-indigo-900 font-extrabold px-3 py-2 rounded-lg border border-indigo-300 shadow-sm active:scale-95 transition">
            + Test Incoming Lead
          </button>
        </div>

        <div v-if="assignedLeads.length === 0" class="text-center py-12 text-gray-400 bg-white rounded-2xl border-2 border-dashed font-semibold">
          No leads assigned yet.
        </div>

        <div v-for="lead in assignedLeads" :key="lead.id" class="bg-white rounded-2xl shadow-md border border-gray-200 p-5 space-y-4">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="font-black text-gray-900 text-lg">{{ lead.client_name }}</h3>
              <span class="text-xs bg-gray-100 text-gray-700 font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">{{ lead.source }}</span>
            </div>
            <span :class="getStatusBadgeClass(lead.status)" class="text-xs font-black px-3 py-1.5 rounded-full shadow-sm">
              {{ lead.status }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-sm text-gray-700 bg-gray-50 p-3 rounded-xl border">
            <div><strong class="text-gray-900">Budget:</strong> {{ lead.budget || 'N/A' }}</div>
            <div><strong class="text-gray-900">Location:</strong> {{ lead.location }}</div>
            <div class="col-span-2" v-if="lead.intent"><strong class="text-gray-900">Intent:</strong> {{ lead.intent }}</div>
          </div>

          <div v-if="broker.cloud_call_recording && lead.recording_url" class="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
            <span class="text-xs font-bold text-indigo-900"><i class="fa-solid fa-microphone"></i> Recording:</span>
            <audio controls class="h-8 w-48">
              <source :src="lead.recording_url" type="audio/mpeg">
            </audio>
          </div>

          <button @click="triggerCallSimulation(lead)" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition">
            <i class="fa-solid fa-phone text-lg"></i> Click-to-Call ({{ lead.client_phone }})
          </button>
        </div>

        <div v-if="activeCallLead" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div class="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 class="text-center font-black text-gray-900 text-xl">Call Completed</h3>
            <p class="text-center text-sm text-gray-600 font-semibold">Select outcome for <strong>{{ activeCallLead.client_name }}</strong>:</p>
            <div class="space-y-3 pt-2">
              <button @click="submitDisposition('Connected')" class="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-black py-4 rounded-2xl border-2 border-emerald-400 text-base shadow-sm">🟢 Connected</button>
              <button @click="submitDisposition('Failed')" class="w-full bg-rose-50 hover:bg-rose-100 text-rose-900 font-black py-4 rounded-2xl border-2 border-rose-400 text-base shadow-sm">🔴 Failed / Wrong Number</button>
              <button @click="submitDisposition('Top-Notch')" class="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 font-black py-4 rounded-2xl border-2 border-amber-400 text-base shadow-sm">⭐ Top-Notch (HOT Lead)</button>
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
            alert('Settings Saved Successfully!');
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
            alert('Telecaller Added Successfully!');
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
              case 'Connected': return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
              case 'Failed': return 'bg-rose-100 text-rose-900 border border-rose-300';
              case 'Top-Notch': return 'bg-amber-100 text-amber-900 border border-amber-300';
              default: return 'bg-blue-100 text-blue-900 border border-blue-300';
            }
          },
          async simulateIncomingLead() {
            const sampleLocations = ['Noida', 'Delhi', 'Gurgaon'];
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
