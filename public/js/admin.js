(function () {
  const user = Auth.requireRole('broker');
  if (!user) return;

  document.getElementById('companyNameLabel').textContent = user.companyName || 'Prop Flow CRM';
  document.getElementById('logoutBtn').addEventListener('click', Auth.logout);

  let locations = [];
  let budgets = [];

  const tabButtons = document.querySelectorAll('.tab-nav button');
  const views = {
    overview: document.getElementById('view-overview'),
    team: document.getElementById('view-team'),
    leads: document.getElementById('view-leads'),
    config: document.getElementById('view-config'),
  };
  function switchView(name) {
    Object.entries(views).forEach(([key, el]) => { el.style.display = key === name ? '' : 'none'; });
    tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'overview') loadOverview();
    if (name === 'team') loadTeam();
    if (name === 'leads') loadLeads();
    if (name === 'config') loadConfig();
  }
  tabButtons.forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));

  const params = new URLSearchParams(window.location.search);
  if (params.get('onboarding') === '1') {
    switchView('config');
    toast('Welcome! Finish setting up your company below.', 'info');
  } else {
    switchView('overview');
  }

  async function loadOverview() {
    try {
      const { leaderboard, summary } = await api('/broker/analytics');
      document.getElementById('summaryStats').innerHTML = `
        <div class="stat-card">
          <div class="stat-icon gold">📈</div>
          <div class="stat-value">${summary.totalLeads}</div>
          <div class="stat-label">Total Leads</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">🕓</div>
          <div class="stat-value">${summary.unclaimed}</div>
          <div class="stat-label">Unclaimed</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">✅</div>
          <div class="stat-value">${summary.connected}</div>
          <div class="stat-label">Connected</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red">⭐</div>
          <div class="stat-value">${summary.hot}</div>
          <div class="stat-label">Hot Leads</div>
        </div>`;

      const listEl = document.getElementById('leaderboardList');
      if (!leaderboard.length) {
        listEl.innerHTML = `<div class="card empty-state"><div class="empty-icon">👥</div>No telecallers yet. Add your first one from the Team tab.</div>`;
        return;
      }
      listEl.innerHTML = leaderboard
        .sort((a, b) => b.connected - a.connected)
        .map((c, i) => `
          <div class="card">
            <div class="flex-between" style="margin-bottom:12px;">
              <div class="lead-name-row">
                <div class="avatar">${initials(c.name) || '?'}</div>
                <div>
                  <div class="lead-name">${escapeHtml(c.name)}</div>
                  <div class="lead-phone">${c.locationSpecialization ? '📍 ' + escapeHtml(c.locationSpecialization) : 'No location set'}</div>
                </div>
              </div>
              ${i === 0 && c.connected > 0 ? '<span class="badge badge-hot">🏆 Top Performer</span>' : ''}
            </div>
            <div class="lead-meta" style="grid-template-columns:repeat(4,1fr);">
              <div><div class="meta-label">Assigned</div><div class="meta-value">${c.totalAssigned}</div></div>
              <div><div class="meta-label">Connected</div><div class="meta-value" style="color:var(--green-700)">${c.connected}</div></div>
              <div><div class="meta-label">Failed</div><div class="meta-value" style="color:var(--red-700)">${c.failed}</div></div>
              <div><div class="meta-label">Hot 🔥</div><div class="meta-value" style="color:var(--gold-700)">${c.hot}</div></div>
            </div>
            ${c.recordings.length ? `
              <div class="divider"></div>
              <div class="meta-label" style="margin-bottom:6px;">Call Recordings</div>
              ${c.recordings.slice(0, 3).map((r) => `
                <div class="flex-between" style="padding:6px 0;">
                  <span style="font-size:12.5px;">${escapeHtml(r.leadName)}</span>
                  <button class="btn btn-outline btn-sm" onclick="playRecording('${r.url}')">▶ Play</button>
                </div>`).join('')}
            ` : ''}
          </div>
        `).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.playRecording = function (url) {
    const audio = new Audio(url);
    audio.play().catch(() => toast('Recording could not be played.', 'error'));
  };

  async function loadTeam() {
    try {
      const callers = await api('/broker/telecallers');
      const listEl = document.getElementById('teamList');
      if (!callers.length) {
        listEl.innerHTML = `<div class="card empty-state"><div class="empty-icon">👥</div>No telecallers yet.<br/>Tap "+ Add Telecaller" to invite your first team member.</div>`;
        return;
      }
      listEl.innerHTML = callers.map((c) => `
        <div class="card">
          <div class="flex-between">
            <div class="lead-name-row">
              <div class="avatar">${initials(c.name) || '?'}</div>
              <div>
                <div class="lead-name">${escapeHtml(c.name)}</div>
                <div class="lead-phone">${escapeHtml(c.email)} · ${escapeHtml(c.phone)}</div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="removeCaller('${c.id}')">Remove</button>
          </div>
          <div class="divider" style="margin:12px 0;"></div>
          <div class="lead-meta" style="grid-template-columns:repeat(4,1fr);">
            <div><div class="meta-label">Location</div><div class="meta-value">${escapeHtml(c.locationSpecialization) || '—'}</div></div>
            <div><div class="meta-label">Assigned</div><div class="meta-value">${c.stats?.assigned || 0}</div></div>
            <div><div class="meta-label">Connected</div><div class="meta-value">${c.stats?.connected || 0}</div></div>
            <div><div class="meta-label">Hot</div><div class="meta-value">${c.stats?.hot || 0}</div></div>
          </div>
        </div>
      `).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.removeCaller = async function (id) {
    if (!confirm('Remove this telecaller? This cannot be undone.')) return;
    try {
      await api(`/broker/telecallers/${id}`, { method: 'DELETE' });
      toast('Telecaller removed.', 'success');
      loadTeam();
    } catch (err) { toast(err.message, 'error'); }
  };

  const addModal = document.getElementById('addCallerModal');
  document.getElementById('openAddCaller').addEventListener('click', () => { addModal.style.display = 'flex'; });
  document.getElementById('closeAddCaller').addEventListener('click', () => { addModal.style.display = 'none'; });
  document.getElementById('addCallerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitAddCaller');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const body = {
        name: document.getElementById('callerName').value.trim(),
        email: document.getElementById('callerEmail').value.trim(),
        phone: document.getElementById('callerPhone').value.trim(),
        locationSpecialization: document.getElementById('callerLocation').value.trim(),
      };
      const data = await api('/broker/telecallers', { method: 'POST', body });
      addModal.style.display = 'none';
      document.getElementById('addCallerForm').reset();
      toast(`Telecaller added! Temp password: ${data.tempPassword}`, 'success');
      loadTeam();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add';
    }
  });

  async function loadLeads() {
    try {
      const status = document.getElementById('leadStatusFilter').value;
      const leads = await api(`/broker/leads${status ? `?status=${encodeURIComponent(status)}` : ''}`);
      const callers = await api('/broker/telecallers');
      const callerMap = Object.fromEntries(callers.map((c) => [c.id, c.name]));
      const body = document.getElementById('leadsTableBody');
      if (!leads.length) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--ink-soft);">No leads yet. They will appear here as soon as your webhook receives one.</td></tr>`;
        return;
      }
      body.innerHTML = leads.map((l) => `
        <tr>
          <td>${escapeHtml(l.name)}</td>
          <td>${escapeHtml(l.phone)}</td>
          <td>${escapeHtml(l.location) || '—'}</td>
          <td>${escapeHtml(l.budget) || '—'}</td>
          <td>${escapeHtml(l.source) || '—'}</td>
          <td><span class="badge ${statusBadgeClass(l.status)}">${l.status}</span></td>
          <td>${l.assignedTo ? escapeHtml(callerMap[l.assignedTo] || 'Unknown') : '—'}</td>
          <td>${l.isHot ? '🔥' : '—'}</td>
        </tr>
      `).join('');
    } catch (err) { toast(err.message, 'error'); }
  }
  document.getElementById('leadStatusFilter').addEventListener('change', loadLeads);

  function renderChips(containerId, arr) {
    const wrap = document.getElementById(containerId);
    const input = wrap.querySelector('input');
    wrap.querySelectorAll('.chip').forEach((c) => c.remove());
    arr.forEach((val, idx) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${escapeHtml(val)} <button type="button" data-idx="${idx}">&times;</button>`;
      wrap.insertBefore(chip, input);
    });
  }

  async function loadConfig() {
    try {
      const broker = await api('/broker/me');
      document.getElementById('cfgCompanyName').value = broker.companyName || '';
      document.getElementById('cfgPhone').value = broker.phone || '';
      document.getElementById('recordingToggle').checked = !!broker.callRecordingEnabled;
      locations = broker.targetLocations || [];
      budgets = broker.budgetBrackets || [];
      renderChips('locationsChips', locations);
      renderChips('budgetsChips', budgets);
      document.getElementById('webhookUrlBox').textContent = broker.webhookUrl;
    } catch (err) { toast(err.message, 'error'); }
  }

  function setupChipInput(inputId, wrapId, getArr, setArr) {
    const input = document.getElementById(inputId);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (val) {
          setArr([...getArr(), val]);
          renderChips(wrapId, getArr());
          input.value = '';
        }
      }
    });
    document.getElementById(wrapId).addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-idx]');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      const arr = getArr();
      arr.splice(idx, 1);
      setArr([...arr]);
      renderChips(wrapId, getArr());
    });
  }
  setupChipInput('locationInput', 'locationsChips', () => locations, (v) => (locations = v));
  setupChipInput('budgetInput', 'budgetsChips', () => budgets, (v) => (budgets = v));

  document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveConfigBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      const body = {
        companyName: document.getElementById('cfgCompanyName').value.trim(),
        phone: document.getElementById('cfgPhone').value.trim(),
        targetLocations: locations,
        budgetBrackets: budgets,
        callRecordingEnabled: document.getElementById('recordingToggle').checked,
      };
      const updated = await api('/broker/config', { method: 'PUT', body });
      document.getElementById('companyNameLabel').textContent = updated.companyName;
      const user2 = Auth.getUser();
      user2.companyName = updated.companyName;
      Auth.setSession(Auth.getToken(), user2);
      toast('Configuration saved!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Configuration';
    }
  });

  document.getElementById('copyWebhookBtn').addEventListener('click', () => {
    const text = document.getElementById('webhookUrlBox').textContent;
    navigator.clipboard.writeText(text).then(() => toast('Webhook URL copied!', 'success'));
  });
})();
