const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ==========================================
// MODULE 1: MASTER DATA ARCHITECTURE (DATABASE)
// ==========================================

const BrokerSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    targetLocations: [String],
    budgetBrackets: [String],
    enableCloudRecording: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const TelecallerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    locationSpecialization: { type: String, required: true },
    brokerEmail: { type: String, required: true }
});

const LeadSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    phone: { type: String, required: true },
    source: { type: String, default: 'Meta Ads' },
    budget: { type: String },
    location: { type: String },
    assignedCallerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Telecaller', default: null },
    status: { type: String, enum: ['Unassigned', 'Connected', 'Failed', 'Top-Notch'], default: 'Unassigned' },
    callRecordingUrl: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const Broker = mongoose.model('Broker', BrokerSchema);
const Telecaller = mongoose.model('Telecaller', TelecallerSchema);
const Lead = mongoose.model('Lead', LeadSchema);

// ==========================================
// MODULE 4: SYSTEM LOGIC & SMART ROUTING HOOK
// ==========================================
app.post('/api/webhooks/leads', async (req, res) => {
    try {
        const { clientName, phone, source, budget, location } = req.body;
        
        // Priority 1: Location Match Routing
        let matchedCaller = await Telecaller.findOne({ 
            locationSpecialization: { $regex: new RegExp(location, 'i') } 
        });

        let assignedId = matchedCaller ? matchedCaller._id : null;
        let initialStatus = matchedCaller ? 'Unassigned' : 'Unassigned'; // Marketplace claim pool if no match

        const newLead = new Lead({
            clientName,
            phone,
            source: source || 'Meta Ads',
            budget,
            location,
            assignedCallerId: assignedId,
            status: initialStatus,
            callRecordingUrl: matchedCaller ? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' : ''
        });

        await newLead.save();
        res.status(201).json({ success: true, message: 'Lead processed via Smart Routing', lead: newLead });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// API ROUTES FOR DASHBOARDS
// ==========================================

// Broker Setup & Config
app.post('/api/broker/setup', async (req, res) => {
    try {
        const { companyName, phone, email, targetLocations, budgetBrackets, enableCloudRecording } = req.body;
        let broker = await Broker.findOneAndUpdate(
            { email }, 
            { companyName, phone, targetLocations, budgetBrackets, enableCloudRecording }, 
            { upsert: true, new: true }
        );
        res.json({ success: true, broker });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add Telecaller
app.post('/api/telecallers', async (req, res) => {
    try {
        const telecaller = new Telecaller(req.body);
        await telecaller.save();
        res.status(201).json({ success: true, telecaller });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/telecallers', async (req, res) => {
    const callers = await Telecaller.find();
    res.json(callers);
});

// Get Leads for Telecaller or Admin Leaderboard
app.get('/api/leads', async (req, res) => {
    const { callerId } = req.query;
    let filter = callerId ? { assignedCallerId: callerId } : {};
    const leads = await Lead.find(filter).populate('assignedCallerId');
    res.json(leads);
});

// Update Lead Status (Disposition Pop-up action)
app.patch('/api/leads/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updatedLead = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json({ success: true, updatedLead });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Marketplace Claim Lead (Priority 2)
app.post('/api/leads/claim', async (req, res) => {
    try {
        const { leadId, callerId } = req.body;
        const lead = await Lead.findByIdAndUpdate(leadId, { assignedCallerId: callerId, status: 'Connected' }, { new: true });
        res.json({ success: true, lead });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Analytics Leaderboard Data
app.get('/api/analytics', async (req, res) => {
    try {
        const callers = await Telecaller.find();
        let analyticsData = [];
        for (let caller of callers) {
            let totalAssigned = await Lead.countDocuments({ assignedCallerId: caller._id });
            let connected = await Lead.countDocuments({ assignedCallerId: caller._id, status: 'Connected' });
            let failed = await Lead.countDocuments({ assignedCallerId: caller._id, status: 'Failed' });
            let topNotch = await Lead.countDocuments({ assignedCallerId: caller._id, status: 'Top-Notch' });
            
            analyticsData.push({
                callerName: caller.name,
                specialization: caller.locationSpecialization,
                totalAssigned,
                connected,
                failed,
                topNotch
            });
        }
        res.json(analyticsData);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// MODULE 2 & 3: FRONTEND UI (SINGLE FILE EMBED)
// ==========================================
app.get('*', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Prop Flow CRM & Automation</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; margin: 0; padding: 0; color: #333; }
            header { background: #007bff; color: white; padding: 15px; text-align: center; font-size: 20px; font-weight: bold; }
            .nav-tabs { display: flex; background: #e9ecef; justify-content: center; padding: 10px; gap: 10px; }
            .nav-tabs button { padding: 10px 20px; border: none; background: #ddd; cursor: pointer; font-weight: bold; border-radius: 5px; }
            .nav-tabs button.active { background: #007bff; color: white; }
            .container { padding: 15px; max-width: 600px; margin: auto; }
            .card { background: white; padding: 15px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            input, select { width: 100%; padding: 10px; margin: 8px 0; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
            button.btn { background: #28a745; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 5px; }
            button.btn-danger { background: #dc3545; }
            button.btn-warning { background: #ffc107; color: #000; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f1f3f5; }
            .hidden { display: none; }
        </style>
    </head>
    <body>
        <header>Prop Flow CRM & Automation</header>
        <div class="nav-tabs">
            <button id="tabAdminBtn" onclick="switchTab('admin')">Admin Dashboard</button>
            <button id="tabCallerBtn" onclick="switchTab('caller')">Telecaller View (Mobile)</button>
        </div>

        <!-- MODULE 2: ADMIN DASHBOARD -->
        <div id="adminView" class="container">
            <div class="card">
                <h3>🏢 Broker Onboarding & Setup</h3>
                <input type="text" id="compName" placeholder="Company Name" value="PropFlow Realty">
                <input type="text" id="compPhone" placeholder="Phone Number" value="9876543210">
                <input type="email" id="compEmail" placeholder="Admin Email" value="admin@propflow.com">
                <input type="text" id="targetLocs" placeholder="Target Locations (Comma separated: Noida, Delhi)" value="Noida, Delhi">
                <input type="text" id="budgets" placeholder="Budget Brackets (Comma separated: <50L, 50L-1Cr, 1Cr+)" value="Below 50L, 50L-1Cr, 1Cr+">
                <label><input type="checkbox" id="cloudRec" checked> Enable Cloud Call Recording</label>
                <button class="btn" onclick="saveBrokerConfig()">Save Configuration</button>
            </div>

            <div class="card">
                <h3>👥 Team Management (Add Telecaller)</h3>
                <input type="text" id="callerName" placeholder="Caller Name">
                <input type="email" id="callerEmail" placeholder="Caller Email">
                <input type="text" id="callerPhone" placeholder="Caller Phone Number">
                <input type="text" id="callerLoc" placeholder="Location Specialization (e.g. Noida)">
                <button class="btn" onclick="addTelecaller()">Add Telecaller</button>
            </div>

            <div class="card">
                <h3>📊 Live Analytics Leaderboard</h3>
                <div id="leaderboardDiv">Loading analytics...</div>
            </div>
        </div>

        <!-- MODULE 3: TELECALLER MOBILE DASHBOARD -->
        <div id="callerView" class="container hidden">
            <div class="card">
                <h3>📱 Select Telecaller Profile</h3>
                <select id="callerSelect" onchange="loadCallerLeads()"><option value="">-- Choose Your Profile --</option></select>
            </div>
            <div id="leadsListContainer">
                <p>Please select your profile to view assigned leads.</p>
            </div>
        </div>

        <script>
            const API_URL = window.location.origin;

            function switchTab(tab) {
                if(tab === 'admin') {
                    document.getElementById('adminView').classList.remove('hidden');
                    document.getElementById('callerView').classList.add('hidden');
                    document.getElementById('tabAdminBtn').classList.add('active');
                    document.getElementById('tabCallerBtn').classList.remove('active');
                    loadAnalytics();
                } else {
                    document.getElementById('adminView').classList.add('hidden');
                    document.getElementById('callerView').classList.remove('hidden');
                    document.getElementById('tabCallerBtn').classList.add('active');
                    document.getElementById('tabAdminBtn').classList.remove('active');
                    loadCallerDropdown();
                }
            }

            async function saveBrokerConfig() {
                const data = {
                    companyName: document.getElementById('compName').value,
                    phone: document.getElementById('compPhone').value,
                    email: document.getElementById('compEmail').value,
                    targetLocations: document.getElementById('targetLocs').value.split(',').map(s => s.trim()),
                    budgetBrackets: document.getElementById('budgets').value.split(',').map(s => s.trim()),
                    enableCloudRecording: document.getElementById('cloudRec').checked
                };
                const res = await fetch(API_URL + '/api/broker/setup', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) alert('Configuration saved successfully!');
            }

            async function addTelecaller() {
                const data = {
                    name: document.getElementById('callerName').value,
                    email: document.getElementById('callerEmail').value,
                    phone: document.getElementById('callerPhone').value,
                    locationSpecialization: document.getElementById('callerLoc').value,
                    brokerEmail: document.getElementById('compEmail').value
                };
                const res = await fetch(API_URL + '/api/telecallers', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) {
                    alert('Telecaller added successfully!');
                    document.getElementById('callerName').value = '';
                    document.getElementById('callerEmail').value = '';
                    document.getElementById('callerPhone').value = '';
                    document.getElementById('callerLoc').value = '';
                }
            }

            async function loadAnalytics() {
                const res = await fetch(API_URL + '/api/analytics');
                const data = await res.json();
                let html = '<table><tr><th>Caller</th><th>Assigned</th><th>Connected</th><th>Failed</th><th>Top-Notch</th></tr>';
                data.forEach(row => {
                    html += \`<tr><td>\${row.callerName} (\${row.specialization})</td><td>\${row.totalAssigned}</td><td>\${row.connected}</td><td>\${row.failed}</td><td>\${row.topNotch}</td></tr>\`;
                });
                html += '</table>';
                document.getElementById('leaderboardDiv').innerHTML = html;
            }

            async function loadCallerDropdown() {
                const res = await fetch(API_URL + '/api/telecallers');
                const callers = await res.json();
                let select = document.getElementById('callerSelect');
                select.innerHTML = '<option value="">-- Choose Your Profile --</option>';
                callers.forEach(c => {
                    select.innerHTML += \`<option value="\${c._id}">\${c.name} (\${c.locationSpecialization})</option>\`;
                });
            }

            async function loadCallerLeads() {
                const callerId = document.getElementById('callerSelect').value;
                if(!callerId) return;
                const res = await fetch(API_URL + '/api/leads?callerId=' + callerId);
                const leads = await res.json();
                let container = document.getElementById('leadsListContainer');
                container.innerHTML = '<h4>Assigned Leads</h4>';
                if(leads.length === 0) {
                    container.innerHTML += '<p>No leads assigned right now.</p>';
                    return;
                }
                leads.forEach(l => {
                    container.innerHTML += \`
                        <div class="card" style="border-left: 5px solid #007bff;">
                            <strong>\${l.clientName}</strong><br>
                            📞 Phone: <a href="tel:\${l.phone}">\${l.phone}</a><br>
                            🏷️ Source: \${l.source} | 📍 Location: \${l.location}<br>
                            💰 Budget: \${l.budget || 'N/A'}<br>
                            📊 Status: <b>\${l.status}</b><br><br>
                            <a href="tel:\${l.phone}"><button class="btn" style="background:#17a2b8;">📞 Click-to-Call</button></a>
                            <div style="margin-top:8px; display:flex; gap:5px;">
                                <button class="btn" style="background:#28a745;" onclick="updateStatus('\${l._id}', 'Connected')">🟢 Connected</button>
                                <button class="btn btn-danger" onclick="updateStatus('\${l._id}', 'Failed')">🔴 Failed</button>
                                <button class="btn btn-warning" onclick="updateStatus('\${l._id}', 'Top-Notch')">⭐ Top-Notch</button>
                            </div>
                        </div>
                    \`;
                });
            }

            async function updateStatus(leadId, status) {
                const res = await fetch(API_URL + '/api/leads/' + leadId + '/status', {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({status})
                });
                const result = await res.json();
                if(result.success) {
                    alert('Lead status updated to ' + status);
                    loadCallerLeads();
                }
            }

            // Default load
            switchTab('admin');
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// DATABASE CONNECTION & SERVER START
// ==========================================
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://abhay952880_db_user:BwPxFSXWEbzk3oRN@cluster0.izhyu6e.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('MongoDB Connected Successfully');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.log('DB Connection Error:', err));
