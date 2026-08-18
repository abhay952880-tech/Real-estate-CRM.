const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ================= DATABASE SCHEMAS =================
const BrokerSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    targetLocations: [String],
    budgetBrackets: [String],
    enableCloudRecording: { type: Boolean, default: false }
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
    source: { type: String, default: 'Direct Web' },
    budget: { type: String },
    location: { type: String },
    assignedCallerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Telecaller', default: null },
    status: { type: String, enum: ['Unassigned', 'Connected', 'Failed', 'Top-Notch'], default: 'Unassigned' },
    createdAt: { type: Date, default: Date.now }
});

const Broker = mongoose.model('Broker', BrokerSchema);
const Telecaller = mongoose.model('Telecaller', TelecallerSchema);
const Lead = mongoose.model('Lead', LeadSchema);

// ================= API ROUTES =================
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

app.get('/api/brokers', async (req, res) => {
    const brokers = await Broker.find();
    res.json(brokers);
});

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

app.post('/api/client/submit', async (req, res) => {
    try {
        const { clientName, phone, budget, location } = req.body;
        const newLead = new Lead({ clientName, phone, source: 'Client Portal', budget, location });
        await newLead.save();

        const matchedBrokers = await Broker.find({
            $or: [
                { targetLocations: { $regex: new RegExp(location, 'i') } },
                { budgetBrackets: { $regex: new RegExp(budget, 'i') } }
            ]
        });

        res.json({ success: true, matchedBrokers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/leads', async (req, res) => {
    const { callerId } = req.query;
    let filter = callerId ? { assignedCallerId: callerId } : {};
    const leads = await Lead.find(filter).populate('assignedCallerId');
    res.json(leads);
});

app.patch('/api/leads/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updatedLead = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json({ success: true, updatedLead });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

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
                totalAssigned, connected, failed, topNotch
            });
        }
        res.json(analyticsData);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================= FRONTEND UI =================
app.get('*', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Prop Flow Real Estate CRM</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f6f9; margin: 0; padding: 0; color: #333; }
            header { background: #1e293b; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            
            /* Modern Circular Top-Right UI */
            .profile-pill { display: flex; align-items: center; background: #334155; padding: 4px 12px 4px 4px; border-radius: 30px; border: 1px solid #475569; gap: 8px; }
            .profile-circle { width: 32px; height: 32px; background: #2563eb; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; box-shadow: inset 0 2px 4px rgba(255,255,255,0.2); }
            .profile-info { display: flex; flex-direction: column; text-align: left; }
            .profile-name { font-size: 12px; color: #f8fafc; font-weight: 600; line-height: 1.2; }
            .profile-pill button { background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 15px; font-size: 10px; cursor: pointer; font-weight: bold; margin-left: 6px; transition: background 0.2s; }
            .profile-pill button:hover { background: #dc2626; }

            .container { padding: 15px; max-width: 600px; margin: auto; }
            .card { background: white; padding: 15px; margin-bottom: 15px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            input, select { width: 100%; padding: 12px; margin: 8px 0; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; }
            button.btn { background: #2563eb; color: white; border: none; padding: 12px; width: 100%; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 5px; font-size: 15px; }
            button.btn-success { background: #16a34a; }
            button.btn-danger { background: #dc2626; }
            button.btn-warning { background: #ca8a04; color: white; }
            .hidden { display: none !important; }
            .step-section { margin-bottom: 20px; border-left: 4px solid #2563eb; padding-left: 12px; }
            .leaderboard-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin-bottom: 10px; }
            .lead-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 13px; color: #475569; margin-top: 5px; }
        </style>
    </head>
    <body>
        <header>
            <span>Prop Flow CRM</span>
            <!-- Top Right Circular Profile UI -->
            <div id="topRightProfile" class="profile-pill hidden">
                <div class="profile-circle" id="profileInitial">A</div>
                <div class="profile-info">
                    <span class="profile-name" id="profileNameDisplay">Role</span>
                </div>
                <button onclick="changeProfile()">Switch</button>
            </div>
        </header>
        
        <!-- LOCK UI / ROLE SELECTION SCREEN -->
        <div id="roleSelectorScreen" class="container">
            <div class="card" style="text-align: center; padding: 30px 15px;">
                <h2>Welcome to Prop Flow</h2>
                <p style="color: #64748b; margin-bottom: 20px;">Select your role to lock and enter your portal:</p>
                <button class="btn" onclick="selectRole('broker', 'Broker Admin')">🏢 Broker Admin Login</button>
                <button class="btn btn-success" style="margin-top: 10px;" onclick="selectRole('telecaller', 'Telecaller')">📞 Telecaller Portal</button>
                <button class="btn btn-warning" style="margin-top: 10px;" onclick="selectRole('client', 'Client')">🏠 Client Portal (Find Broker)</button>
            </div>
        </div>

        <!-- 1. BROKER ADMIN DASHBOARD -->
        <div id="brokerAdminView" class="container hidden">
            <div class="card">
                <h2>🏢 Broker Admin Dashboard</h2>
                <div class="step-section">
                    <h3>Step 1: Company Setup & Configuration</h3>
                    <input type="text" id="compName" placeholder="Company Name" value="PropFlow Realty">
                    <input type="text" id="compPhone" placeholder="Phone Number" value="9876543210">
                    <input type="email" id="compEmail" placeholder="Admin Email" value="admin@propflow.com">
                    <input type="text" id="targetLocs" placeholder="Target Locations (Noida, Delhi)" value="Noida, Delhi">
                    <input type="text" id="budgets" placeholder="Budget Brackets (<50L, 50L-1Cr, 1Cr+)" value="Below 50L, 50L-1Cr, 1Cr+">
                    <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                        <input type="checkbox" id="cloudRec" checked style="width:auto;"> Enable Cloud Call Recording
                    </label>
                    <button class="btn btn-success" onclick="saveBrokerConfig()">Save Setup</button>
                </div>

                <hr style="border:0; border-top:1px solid #e2e8f0; margin: 20px 0;">

                <div class="step-section" style="border-left-color: #16a34a;">
                    <h3>Step 2: Team Management (Add Telecallers)</h3>
                    <input type="text" id="callerName" placeholder="Telecaller Name">
                    <input type="email" id="callerEmail" placeholder="Telecaller Email">
                    <input type="text" id="callerPhone" placeholder="Telecaller Phone Number">
                    <input type="text" id="callerLoc" placeholder="Location Specialization (e.g. Noida)">
                    <button class="btn" onclick="addTelecaller()">Add Telecaller to Team</button>
                </div>

                <hr style="border:0; border-top:1px solid #e2e8f0; margin: 20px 0;">

                <div class="step-section" style="border-left-color: #ca8a04;">
                    <h3>Step 3: Live Analytics Leaderboard</h3>
                    <div id="androidLeaderboard">Loading leaderboard...</div>
                </div>
            </div>
        </div>

        <!-- 2. TELECALLER PORTAL -->
        <div id="telecallerView" class="container hidden">
            <div class="card">
                <h3>📞 Telecaller Portal</h3>
                <label>Select Your Profile:</label>
                <select id="callerSelect" onchange="loadCallerData()"><option value="">-- Choose Profile --</option></select>
            </div>

            <div id="callerDataContainer" class="hidden">
                <div class="card">
                    <h4>📊 Team Leaderboard View</h4>
                    <div id="telecallerLeaderboard"></div>
                </div>
                <div class="card">
                    <h4>🎯 Your Assigned Leads</h4>
                    <div id="callerLeadsList"></div>
                </div>
            </div>
        </div>

        <!-- 3. CLIENT PORTAL -->
        <div id="clientView" class="container hidden">
            <div class="card">
                <h3>🏠 Client Inquiry Form</h3>
                <p style="font-size: 13px; color: #64748b;">Fill your requirement to find matching specialized brokers.</p>
                <input type="text" id="clientName" placeholder="Your Full Name">
                <input type="text" id="clientPhone" placeholder="Your Phone Number">
                <input type="text" id="clientLoc" placeholder="Preferred Location (e.g. Noida)">
                <select id="clientBudget">
                    <option value="">Select Budget Bracket</option>
                    <option value="Below 50L">Below 50L</option>
                    <option value="50L-1Cr">50L-1Cr</option>
                    <option value="1Cr+">1Cr+</option>
                </select>
                <button class="btn btn-success" onclick="submitClientLead()">Find Matching Brokers</button>
            </div>

            <div id="matchingBrokersContainer" class="card hidden">
                <h4>✨ Matching Specialized Brokers</h4>
                <div id="brokersListResult"></div>
            </div>
        </div>

        <script>
            const API_URL = window.location.origin;

            window.onload = function() {
                const savedRole = localStorage.getItem('propflow_role');
                const savedRoleName = localStorage.getItem('propflow_role_name');
                if(savedRole) {
                    activateRoleUI(savedRole, savedRoleName);
                }
            }

            function selectRole(role, roleName) {
                localStorage.setItem('propflow_role', role);
                localStorage.setItem('propflow_role_name', roleName);
                activateRoleUI(role, roleName);
            }

            function activateRoleUI(role, roleName) {
                document.getElementById('roleSelectorScreen').classList.add('hidden');
                document.getElementById('topRightProfile').classList.remove('hidden');
                document.getElementById('profileNameDisplay').innerText = roleName;
                document.getElementById('profileInitial').innerText = roleName.charAt(0).toUpperCase();

                document.getElementById('brokerAdminView').classList.add('hidden');
                document.getElementById('telecallerView').classList.add('hidden');
                document.getElementById('clientView').classList.add('hidden');

                if(role === 'broker') {
                    document.getElementById('brokerAdminView').classList.remove('hidden');
                    loadAdminLeaderboard();
                } else if(role === 'telecaller') {
                    document.getElementById('telecallerView').classList.remove('hidden');
                    loadCallerDropdown();
                } else if(role === 'client') {
                    document.getElementById('clientView').classList.remove('hidden');
                }
            }

            function changeProfile() {
                localStorage.removeItem('propflow_role');
                localStorage.removeItem('propflow_role_name');
                document.getElementById('topRightProfile').classList.add('hidden');
                document.getElementById('brokerAdminView').classList.add('hidden');
                document.getElementById('telecallerView').classList.add('hidden');
                document.getElementById('clientView').classList.add('hidden');
                document.getElementById('roleSelectorScreen').classList.remove('hidden');
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
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) alert('Step 1: Broker Setup Saved Successfully!');
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
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) {
                    alert('Step 2: Telecaller Added Successfully!');
                    document.getElementById('callerName').value = '';
                    document.getElementById('callerEmail').value = '';
                    document.getElementById('callerPhone').value = '';
                    document.getElementById('callerLoc').value = '';
                    loadAdminLeaderboard();
                }
            }

            async function loadAdminLeaderboard() {
                const res = await fetch(API_URL + '/api/analytics');
                const data = await res.json();
                renderAndroidLeaderboard('androidLeaderboard', data);
            }

            function renderAndroidLeaderboard(elementId, data) {
                let container = document.getElementById(elementId);
                if(data.length === 0) {
                    container.innerHTML = '<p style="font-size:13px; color:#64748b;">No telecallers added yet.</p>';
                    return;
                }
                let html = '';
                data.forEach(row => {
                    html += \`
                        <div class="leaderboard-card">
                            <strong>\${row.callerName}</strong> <span style="font-size:12px; color:#2563eb;">(\${row.specialization})</span>
                            <div class="lead-grid">
                                <div>Assigned: <b>\${row.totalAssigned}</b></div>
                                <div>Connected: <b style="color:#16a34a;">\${row.connected}</b></div>
                                <div>Failed: <b style="color:#dc2626;">\${row.failed}</b></div>
                                <div>Top-Notch: <b style="color:#ca8a04;">\${row.topNotch}</b></div>
                            </div>
                        </div>
                    \`;
                });
                container.innerHTML = html;
            }

            async function loadCallerDropdown() {
                const res = await fetch(API_URL + '/api/telecallers');
                const callers = await res.json();
                let select = document.getElementById('callerSelect');
                select.innerHTML = '<option value="">-- Choose Profile --</option>';
                callers.forEach(c => {
                    select.innerHTML += \`<option value="\${c._id}">\${c.name} (\${c.locationSpecialization})</option>\`;
                });
            }

            async function loadCallerData() {
                const callerId = document.getElementById('callerSelect').value;
                if(!callerId) {
                    document.getElementById('callerDataContainer').classList.add('hidden');
                    return;
                }
                document.getElementById('callerDataContainer').classList.remove('hidden');
                
                const analyticsRes = await fetch(API_URL + '/api/analytics');
                const analyticsData = await analyticsRes.json();
                renderAndroidLeaderboard('telecallerLeaderboard', analyticsData);

                const leadsRes = await fetch(API_URL + '/api/leads?callerId=' + callerId);
                const leads = await leadsRes.json();
                let leadsContainer = document.getElementById('callerLeadsList');
                if(leads.length === 0) {
                    leadsContainer.innerHTML = '<p style="font-size:13px; color:#64748b;">No leads assigned to you right now.</p>';
                    return;
                }
                let lHtml = '';
                leads.forEach(l => {
                    lHtml += \`
                        <div class="leaderboard-card" style="border-left: 4px solid #2563eb;">
                            <strong>\${l.clientName}</strong><br>
                            📞 Phone: <a href="tel:\${l.phone}">\${l.phone}</a><br>
                            📍 Location: \${l.location} | Budget: \${l.budget || 'N/A'}<br>
                            📊 Status: <b>\${l.status}</b><br>
                            <div style="margin-top:8px; display:flex; gap:4px;">
                                <button class="btn btn-success" style="padding:6px; font-size:12px;" onclick="updateLeadStatus('\${l._id}', 'Connected')">🟢 Connected</button>
                                <button class="btn btn-danger" style="padding:6px; font-size:12px;" onclick="updateLeadStatus('\${l._id}', 'Failed')">🔴 Failed</button>
                                <button class="btn btn-warning" style="padding:6px; font-size:12px;" onclick="updateLeadStatus('\${l._id}', 'Top-Notch')">⭐ Top-Notch</button>
                            </div>
                        </div>
                    \`;
                });
                leadsContainer.innerHTML = lHtml;
            }

            async function updateLeadStatus(leadId, status) {
                const res = await fetch(API_URL + '/api/leads/' + leadId + '/status', {
                    method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status})
                });
                const result = await res.json();
                if(result.success) {
                    alert('Status updated to ' + status);
                    loadCallerData();
                }
            }

            async function submitClientLead() {
                const data = {
                    clientName: document.getElementById('clientName').value,
                    phone: document.getElementById('clientPhone').value,
                    location: document.getElementById('clientLoc').value,
                    budget: document.getElementById('clientBudget').value
                };
                if(!data.clientName || !data.phone || !data.location || !data.budget) {
                    alert('Please fill all fields.');
                    return;
                }
                const res = await fetch(API_URL + '/api/client/submit', {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) {
                    document.getElementById('matchingBrokersContainer').classList.remove('hidden');
                    let bContainer = document.getElementById('brokersListResult');
                    if(result.matchedBrokers.length === 0) {
                        bContainer.innerHTML = '<p style="font-size:13px; color:#64748b;">No specific matching brokers found right now.</p>';
                        return;
                    }
                    let bHtml = '';
                    result.matchedBrokers.forEach(b => {
                        bHtml += \`
                            <div class="leaderboard-card" style="border-left: 4px solid #16a34a;">
                                <strong>🏢 \${b.companyName}</strong><br>
                                📞 Contact: <a href="tel:\${b.phone}">\${b.phone}</a><br>
                                ✉️ Email: \${b.email}<br>
                                📍 Specialization: \${b.targetLocations.join(', ')}
                            </div>
                        \`;
                    });
                    bContainer.innerHTML = bHtml;
                    alert('Inquiry submitted successfully! Matching brokers shown below.');
                }
            }
        </script>
    </body>
    </html>
    `);
});

// ================= START SERVER =================
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://abhay952880_db_user:BwPxFSXWEbzk3oRN@cluster0.izhyu6e.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('MongoDB Connected Successfully');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.log('DB Connection Error:', err));
