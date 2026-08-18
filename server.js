const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ================= DATABASE SCHEMAS =================
const OrganizationSchema = new mongoose.Schema({
    orgName: { type: String, default: "O2 Realty Developers and Promoters" },
    adminEmail: { type: String, unique: true, default: "admin@o2realty.com" },
    phone: { type: String, default: "9876543210" }
});

const LeadSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: "NA" },
    status: { type: String, enum: ['New', 'Follow Up', 'Hot', 'Connected', 'Booked', 'Dead'], default: 'New' },
    hotLead: { type: String, default: 'No' },
    source: { type: String, default: 'Meta Lead Ads' },
    assignedRM: { type: String, default: 'Avinash Patil' },
    budget: { type: String, default: '50L-1Cr' },
    location: { type: String, default: 'Noida' },
    lastUpdateNote: { type: String, default: 'Busy' },
    nextFollowUp: { type: String, default: 'Tomorrow, 11:00' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Organization = mongoose.model('Organization', OrganizationSchema);
const Lead = mongoose.model('Lead', LeadSchema);

// Seed initial data if empty
async function seedData() {
    const count = await Lead.countDocuments();
    if(count === 0) {
        await Lead.insertMany([
            { clientName: "Roshan", phone: "7798124639", status: "Follow Up", assignedRM: "vishal", source: "Meta Lead Ads" },
            { clientName: "Suraj", phone: "8007340017", status: "Follow Up", assignedRM: "vishal", source: "Direct Web" },
            { clientName: "Abhishek Jamsandekar", phone: "9172281440", status: "Follow Up", assignedRM: "vishal", source: "Push API" },
            { clientName: "Satyam Kupate", phone: "7721060406", status: "New", assignedRM: "Ambika Dapke", source: "Meta Lead Ads" },
            { clientName: "Mahendra Pachetiya", phone: "8766840248", status: "Follow Up", assignedRM: "Avinash Patil", source: "NA" }
        ]);
    }
}
seedData();

// ================= API ROUTES =================
app.get('/api/stats', async (req, res) => {
    try {
        const totalLeads = await Lead.countDocuments();
        const newLeads = await Lead.countDocuments({ status: 'New' });
        const followUps = await Lead.countDocuments({ status: 'Follow Up' });
        const ringingLeads = await Lead.countDocuments({ status: 'Connected' });
        const booked = await Lead.countDocuments({ status: 'Booked' });
        const deadLeads = await Lead.countDocuments({ status: 'Dead' });
        
        res.json({
            success: true,
            stats: { totalLeads, newLeads, followUps, ringingLeads, booked, deadLeads, siteVisits: 2, meetings: 0, backlog: 249 }
        });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/leads', async (req, res) => {
    try {
        const { status, rm } = req.query;
        let filter = {};
        if(status) filter.status = status;
        if(rm) filter.assignedRM = rm;
        const leads = await Lead.find(filter).sort({ updatedAt: -1 });
        res.json(leads);
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/leads', async (req, res) => {
    try {
        const newLead = new Lead(req.body);
        await newLead.save();
        res.json({ success: true, newLead });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/leads/:id', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        res.json(lead);
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.patch('/api/leads/:id', async (req, res) => {
    try {
        const updated = await Lead.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: Date.now() }, { new: true });
        res.json({ success: true, updated });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================= FRONTEND UI (EXACT MATCH WITH SCREENSHOTS) =================
app.get('*', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Capcun CRM - O2 Realty</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f1117; margin: 0; padding: 0; color: #f1f5f9; }
            header { background: #161b22; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; position: sticky; top:0; z-index:100; }
            
            /* Top Right Profile Circle UI */
            .profile-pill { display: flex; align-items: center; background: #21262d; padding: 4px 10px 4px 4px; border-radius: 30px; border: 1px solid #30363d; gap: 8px; cursor: pointer; }
            .profile-circle { width: 32px; height: 32px; background: #1f6feb; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; }
            .profile-name { font-size: 12px; color: #f0f6fc; font-weight: 600; }
            .switch-btn { background: #da3633; color: white; border: none; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; cursor: pointer; }

            .container { padding: 12px; max-width: 500px; margin: auto; }
            .card { background: #161b22; border: 1px solid #30363d; padding: 14px; margin-bottom: 12px; border-radius: 12px; }
            
            /* Dashboard Metrics Grid */
            .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
            .metric-box { background: #161b22; border: 1px solid #30363d; padding: 14px; border-radius: 12px; position: relative; }
            .metric-box h2 { margin: 0; font-size: 26px; color: #ffffff; }
            .metric-box p { margin: 4px 0 0 0; font-size: 13px; color: #8b949e; }
            .icon-badge { width: 24px; height: 24px; border-radius: 50%; background: #21262d; display: flex; align-items: center; justify-content: center; font-size: 11px; margin-bottom: 8px; color: #58a6ff; }

            /* Buttons & Inputs */
            input, select, textarea { width: 100%; padding: 10px; margin: 6px 0; box-sizing: border-box; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; color: white; font-size: 14px; }
            .btn { background: #1f6feb; color: white; border: none; padding: 10px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; text-align: center; display: block; text-decoration: none; font-size: 14px; }
            .btn-green { background: #238636; }
            .btn-red { background: #da3633; }
            .btn-outline { background: transparent; border: 1px solid #30363d; color: #c9d1d9; }
            
            .hidden { display: none !important; }
            .flex-row { display: flex; justify-content: space-between; align-items: center; }
            
            /* Lead card item */
            .lead-item { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
            .tag { background: #21262d; padding: 3px 8px; border-radius: 6px; font-size: 11px; color: #58a6ff; border: 1px solid #30363d; }
            
            /* Settings Menu Item */
            .menu-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #161b22; border: 1px solid #30363d; border-radius: 10px; margin-bottom: 8px; cursor: pointer; color: #c9d1d9; font-size: 14px; }
            .menu-item:hover { background: #21262d; }
        </style>
    </head>
    <body>
        <header>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="cursor:pointer; font-size:18px;" onclick="goBack()">⬅</span>
                <span id="headerTitle" style="font-weight:600; font-size:16px;">Admin</span>
            </div>
            <!-- Top Right Locked Profile Circle -->
            <div id="topRightProfile" class="profile-pill hidden">
                <div class="profile-circle" id="profileInitial">A</div>
                <div style="display:flex; flex-direction:column;">
                    <span class="profile-name" id="profileNameDisplay">Admin</span>
                </div>
                <button class="switch-btn" onclick="openProfileModal()">Switch</button>
            </div>
        </header>

        <!-- ROLE & PROFILE LOCK SCREEN -->
        <div id="profileModal" class="container" style="margin-top: 40px;">
            <div class="card" style="text-align: center; padding: 25px;">
                <h3 style="margin-top:0; color:#fff;">Select CRM Role</h3>
                <p style="color: #8b949e; font-size: 13px; margin-bottom: 20px;">Choose your profile to lock access & enter dashboard:</p>
                <button class="btn" style="margin-bottom:10px;" onclick="selectRole('Admin', 'O2 Realty Admin')">🏢 Admin Dashboard (O2 Realty)</button>
                <button class="btn btn-green" style="margin-bottom:10px;" onclick="selectRole('RM', 'Avinash Patil (RM)')">👨‍💼 RM Dashboard (Avinash Patil)</button>
                <button class="btn btn-outline" onclick="openSettingsView()">⚙️ Settings & Language</button>
            </div>
        </div>

        <!-- APP CONTAINER -->
        <div id="appContainer" class="container hidden">

            <!-- ADMIN DASHBOARD VIEW -->
            <div id="adminView" class="hidden">
                <div class="card" style="background: #161b22; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size: 11px; color: #8b949e;">Selected Date</div>
                        <div style="font-size: 15px; font-weight: bold; margin-top:2px;">📅 14-03-2026</div>
                    </div>
                    <button class="btn btn-outline" style="width: auto; padding: 6px 12px; font-size: 12px;">Change</button>
                </div>

                <div style="background: #21262d; border-left: 3px solid #e3b341; padding: 10px; border-radius: 8px; font-size: 12px; margin-bottom: 12px;">
                    ℹ️ New release available — test and review.
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <div class="icon-badge">📊</div>
                        <h2 id="mSiteVisits">2</h2>
                        <p>Site Visits</p>
                    </div>
                    <div class="metric-box">
                        <div class="icon-badge">📅</div>
                        <h2 id="mMeetings">0</h2>
                        <p>Meetings</p>
                    </div>
                    <div class="metric-box">
                        <div class="icon-badge">🔄</div>
                        <h2 id="mFollowUps">183</h2>
                        <p>Follow Ups</p>
                    </div>
                    <div class="metric-box">
                        <div class="icon-badge">🌐</div>
                        <h2 id="mNewLeads">1927</h2>
                        <p>New Leads</p>
                    </div>
                    <div class="metric-box" style="border-color: #238636;">
                        <div class="icon-badge" style="color:#238636;">📈</div>
                        <h2 id="mTotalLeads">2271</h2>
                        <p>Total Leads</p>
                    </div>
                    <div class="metric-box">
                        <div class="icon-badge">📞</div>
                        <h2 id="mRingingLeads">96</h2>
                        <p>Ringing Leads</p>
                    </div>
                </div>

                <div class="card flex-row" onclick="alert('Opening RMs Dashboard')" style="cursor: pointer;">
                    <div style="font-weight: 600;">RMs Dashboard</div>
                    <span>➔</span>
                </div>

                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-weight:600;">Dead Leads</span>
                        <span style="font-size: 20px; font-weight:bold;">85</span>
                    </div>
                    <button class="btn" style="padding: 6px; font-size: 12px;" onclick="loadBacklogView('Dead')">View Details</button>
                </div>

                <div class="card" style="background: linear-gradient(135deg, #161b22, #21262d);">
                    <div style="text-align: center;">
                        <div style="font-size: 28px; font-weight: bold; color: #ff7b72;">249</div>
                        <div style="font-size: 12px; color: #8b949e; letter-spacing: 1px; margin-bottom: 10px;">BACKLOG LEADS</div>
                        <button class="btn btn-red" onclick="loadBacklogView('All')">View Backlog Details</button>
                    </div>
                </div>
            </div>

            <!-- RM DASHBOARD VIEW -->
            <div id="rmView" class="hidden">
                <div class="card flex-row">
                    <div>
                        <div style="font-size: 11px; color: #8b949e;">Today</div>
                        <div style="font-size: 15px; font-weight: bold;">14-03-2026</div>
                    </div>
                    <button class="btn btn-outline" style="width: auto; padding: 6px 12px; font-size: 12px;">Change</button>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <h2>426</h2>
                        <p>Total Leads</p>
                    </div>
                    <div class="metric-box">
                        <h2>108</h2>
                        <p>Follow Ups</p>
                    </div>
                    <div class="metric-box">
                        <h2>0</h2>
                        <p>Meetings</p>
                    </div>
                </div>

                <div class="card">
                    <h4 style="margin:0 0 10px 0; font-size:13px; color:#8b949e;">Lead Funnel</h4>
                    <div style="display:flex; justify-content:space-between; text-align:center;">
                        <div><b style="color:#58a6ff; font-size:18px;">286</b><br><span style="font-size:11px; color:#8b949e;">New</span></div>
                        <div><b style="color:#e3b341; font-size:18px;">0</b><br><span style="font-size:11px; color:#8b949e;">Hot</span></div>
                        <div><b style="color:#bc8cff; font-size:18px;">119</b><br><span style="font-size:11px; color:#8b949e;">Follow Up</span></div>
                    </div>
                </div>

                <button class="btn btn-red" onclick="loadBacklogView('All')">View Backlog Leads (18)</button>
            </div>

            <!-- BACKLOG / LEADS LIST VIEW -->
            <div id="backlogView" class="hidden">
                <div class="flex-row" style="margin-bottom: 10px;">
                    <h3 style="margin:0;">BACKLOG LEADS</h3>
                    <span id="leadCountLabel" style="font-size: 12px; color:#8b949e;">100+ leads</span>
                </div>
                <input type="text" id="searchInput" placeholder="Name, phone, email, status..." onkeyup="filterLeads()">
                <div id="leadsListContainer" style="margin-top: 10px;"></div>
            </div>

            <!-- LEAD DETAIL VIEW -->
            <div id="leadDetailView" class="hidden">
                <div class="card" style="background: #21262d;">
                    <h2 id="detailClientName" style="margin:0 0 4px 0; font-size:18px;">Client Name</h2>
                    <div id="detailPhone" style="font-size:13px; color:#8b949e;">Phone Number</div>
                </div>
                <div class="card">
                    <div class="flex-row" style="padding: 6px 0; border-bottom:1px solid #30363d;"><span style="color:#8b949e;">Project</span><span id="dProject">-</span></div>
                    <div class="flex-row" style="padding: 6px 0; border-bottom:1px solid #30363d;"><span style="color:#8b949e;">Phone</span><span id="dPhone">-</span></div>
                    <div class="flex-row" style="padding: 6px 0; border-bottom:1px solid #30363d;"><span style="color:#8b949e;">Email</span><span id="dEmail">NA</span></div>
                    <div class="flex-row" style="padding: 6px 0; border-bottom:1px solid #30363d;"><span style="color:#8b949e;">Status</span><span id="dStatus" style="color:#58a6ff;">Follow Up</span></div>
                    <div class="flex-row" style="padding: 6px 0; border-bottom:1px solid #30363d;"><span style="color:#8b949e;">Hot Lead</span><span id="dHot">No</span></div>
                    <div class="flex-row" style="padding: 6px 0; border-bottom:1px solid #30363d;"><span style="color:#8b949e;">Source</span><span id="dSource">NA</span></div>
                    <div class="flex-row" style="padding: 6px 0;"><span style="color:#8b949e;">Last Updated</span><span id="dUpdated">2026-03-14</span></div>
                </div>
                <button class="btn" style="margin-bottom: 15px;" onclick="openActivityModal()">Add Follow-up / Activity</button>
                <div class="card">
                    <h4 style="margin:0 0 8px 0; font-size:13px; color:#8b949e;">Recent Activity</h4>
                    <div id="recentActivityBox" style="font-size: 13px;">Next Follow-up: Tomorrow, 11:00</div>
                </div>
            </div>

            <!-- SETTINGS & PROFILE VIEW -->
            <div id="settingsView" class="hidden">
                <div class="card" style="background: #21262d; display:flex; align-items:center; gap:12px;">
                    <div style="width:50px; height:50px; background:#1f6feb; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:20px;">O2</div>
                    <div>
                        <h3 style="margin:0; font-size:16px;">O2 Realty Developers and Promoters</h3>
                        <span style="font-size:11px; color:#58a6ff;">✔ Organization · Admin</span>
                    </div>
                </div>
                <div class="menu-item" onclick="alert('Manager Permissions')"><span>Manager Permissions</span><span>➔</span></div>
                <div class="menu-item" onclick="alert('Notification Settings')"><span>Notification Settings</span><span>➔</span></div>
                <div class="menu-item" onclick="alert('Meta Lead Ads Integration')"><span>Integrations (Meta Lead Ads)</span><span>➔</span></div>
                <div class="menu-item" onclick="alert('Push API Settings')"><span>Push API Key Generator</span><span>➔</span></div>
                <div class="menu-item" onclick="changeLanguagePrompt()"><span>🌐 Select Language (English, Hindi, Marathi)</span><span>➔</span></div>
                <div class="menu-item" style="color:#8b949e;"><span>CAPCUN CRM v1.0.0</span><span></span></div>
            </div>

        </div>

        <script>
            const API_URL = window.location.origin;
            let currentRole = '';
            let allLeadsCache = [];
            let activeLeadId = '';

            window.onload = async function() {
                const savedRole = localStorage.getItem('capcun_role');
                const savedName = localStorage.getItem('capcun_name');
                if(savedRole) {
                    lockIntoRole(savedRole, savedName);
                }
                loadStats();
            }

            async function loadStats() {
                try {
                    const res = await fetch(API_URL + '/api/stats');
                    const data = await res.json();
                    if(data.success) {
                        document.getElementById('mTotalLeads').innerText = data.stats.totalLeads;
                        document.getElementById('mNewLeads').innerText = data.stats.newLeads;
                        document.getElementById('mFollowUps').innerText = data.stats.followUps;
                        document.getElementById('mRingingLeads').innerText = data.stats.ringingLeads;
                    }
                } catch(e){}
            }

            function selectRole(role, name) {
                localStorage.setItem('capcun_role', role);
                localStorage.setItem('capcun_name', name);
                lockIntoRole(role, name);
            }

            function lockIntoRole(role, name) {
                currentRole = role;
                document.getElementById('profileModal').classList.add('hidden');
                document.getElementById('appContainer').classList.remove('hidden');
                document.getElementById('topRightProfile').classList.remove('hidden');
                document.getElementById('profileNameDisplay').innerText = name;
                document.getElementById('profileInitial').innerText = name.charAt(0).toUpperCase();

                hideAllViews();
                if(role === 'Admin') {
                    document.getElementById('adminView').classList.remove('hidden');
                    document.getElementById('headerTitle').innerText = 'Admin';
                } else if(role === 'RM') {
                    document.getElementById('rmView').classList.remove('hidden');
                    document.getElementById('headerTitle').innerText = 'Avinash Patil';
                }
            }

            function openProfileModal() {
                localStorage.removeItem('capcun_role');
                localStorage.removeItem('capcun_name');
                document.getElementById('appContainer').classList.add('hidden');
                document.getElementById('topRightProfile').classList.add('hidden');
                document.getElementById('profileModal').classList.remove('hidden');
            }

            function openSettingsView() {
                document.getElementById('profileModal').classList.add('hidden');
                document.getElementById('appContainer').classList.remove('hidden');
                document.getElementById('topRightProfile').classList.add('hidden');
                hideAllViews();
                document.getElementById('settingsView').classList.remove('hidden');
                document.getElementById('headerTitle').innerText = 'Settings';
            }

            function hideAllViews() {
                document.getElementById('adminView').classList.add('hidden');
                document.getElementById('rmView').classList.add('hidden');
                document.getElementById('backlogView').classList.add('hidden');
                document.getElementById('leadDetailView').classList.add('hidden');
                document.getElementById('settingsView').classList.add('hidden');
            }

            function goBack() {
                const settingsActive = !document.getElementById('settingsView').classList.contains('hidden');
                const detailActive = !document.getElementById('leadDetailView').classList.contains('hidden');
                const backlogActive = !document.getElementById('backlogView').classList.contains('hidden');

                if(settingsActive || detailActive || backlogActive) {
                    lockIntoRole(currentRole, localStorage.getItem('capcun_name'));
                } else {
                    openProfileModal();
                }
            }

            async function loadBacklogView(type) {
                hideAllViews();
                document.getElementById('backlogView').classList.remove('hidden');
                document.getElementById('headerTitle').innerText = type === 'Dead' ? 'Dead Leads' : 'BACKLOG';
                
                const res = await fetch(API_URL + '/api/leads');
                allLeadsCache = await res.json();
                renderLeads(allLeadsCache);
            }

            function renderLeads(leads) {
                let container = document.getElementById('leadsListContainer');
                if(leads.length === 0) {
                    container.innerHTML = '<p style="color:#8b949e; text-align:center;">No leads found.</p>';
                    return;
                }
                let html = '';
                leads.forEach(l => {
                    html += \`
                        <div class="lead-item" onclick="openLeadDetail('\${l._id}')" style="cursor:pointer;">
                            <div class="flex-row">
                                <strong style="font-size:15px; color:#fff;">\${l.clientName}</strong>
                                <span class="tag">\${l.status}</span>
                            </div>
                            <div style="font-size:13px; color:#8b949e; margin:4px 0;">📞 \${l.phone}</div>
                            <div class="flex-row" style="font-size:11px; color:#8b949e; margin-top:6px;">
                                <span>👤 \${l.assignedRM}</span>
                                <span>🕒 \${l.source}</span>
                            </div>
                            <div style="display:flex; gap:8px; margin-top:10px;" onclick="event.stopPropagation()">
                                <a href="tel:\${l.phone}" class="btn btn-green" style="padding:6px; font-size:12px;">Call</a>
                                <a href="https://wa.me/\${l.phone}" target="_blank" class="btn" style="padding:6px; font-size:12px; background:#238636;">WhatsApp</a>
                            </div>
                        </div>
                    \`;
                });
                container.innerHTML = html;
            }

            function filterLeads() {
                let query = document.getElementById('searchInput').value.toLowerCase();
                let filtered = allLeadsCache.filter(l => 
                    l.clientName.toLowerCase().includes(query) || 
                    l.phone.includes(query) || 
                    l.status.toLowerCase().includes(query)
                );
                renderLeads(filtered);
            }

            async function openLeadDetail(id) {
                activeLeadId = id;
                const res = await fetch(API_URL + '/api/leads/' + id);
                const l = await res.json();
                
                hideAllViews();
                document.getElementById('leadDetailView').classList.remove('hidden');
                document.getElementById('headerTitle').innerText = 'Lead Details';

                document.getElementById('detailClientName').innerText = l.clientName;
                document.getElementById('detailPhone').innerText = l.phone;
                document.getElementById('dProject').innerText = l.location || '-';
                document.getElementById('dPhone').innerText = l.phone;
                document.getElementById('dEmail').innerText = l.email;
                document.getElementById('dStatus').innerText = l.status;
                document.getElementById('dHot').innerText = l.hotLead;
                document.getElementById('dSource').innerText = l.source;
                document.getElementById('dUpdated').innerText = new Date(l.updatedAt).toLocaleString();
            }

            async function openActivityModal() {
                let note = prompt("Enter Follow-up / Activity Note (e.g., Interested, Busy, Site Visit Done):", "Connected & Interested");
                if(!note) return;
                
                const res = await fetch(API_URL + '/api/leads/' + activeLeadId, {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ lastUpdateNote: note, status: 'Connected' })
                });
                const result = await res.json();
                if(result.success) {
                    alert('Activity Updated Successfully!');
                    openLeadDetail(activeLeadId);
                }
            }

            function changeLanguagePrompt() {
                alert('Language switched successfully!');
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
