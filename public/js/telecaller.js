(function () {
  const user = Auth.requireRole('telecaller');
  if (!user) return;

  document.getElementById('callerNameLabel').textContent = user.name || 'My Leads';
  document.getElementById('logoutBtn').addEventListener('click', Auth.logout);

  let activeLeadId = null;

  const tabButtons = document.querySelectorAll('.tab-nav button');
  const views = {
    assigned: document.getElementById('view-assigned'),
    marketplace: document.getElementById('view-marketplace'),
  };
  function switchView(name) {
    Object.entries(views).forEach(([key, el]) => { el.style.display = key === name ? '' : 'none'; });
    tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  }
  tabButtons.forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));

  function leadCardHtml(lead, mode) {
    const meta = [
      ['Source', lead.source || '—'],
      ['Budget', lead.budget || '—'],
      ['Location', lead.location || '—'],
      ['Intent', lead.intent || lead.size || '—'],
    ];
    return `
      <div class="lead-card ${lead.isHot ? 'hot' : ''}">
        <div class="lead-card-top">
          <div class="lead-name-row">
            <div class="avatar">${initials(lead.name) || '?'}</div>
            <div>
              <div class="lead-name">${escapeHtml(lead.name)} ${lead.isHot ? '🔥' : ''}</div>
              <div class="lead-phone">${escapeHtml(lead.phone)}</div>
            </div>
          </div>
          <span class="badge ${statusBadgeClass(lead.status)}">${lead.status}</span>
        </div>
        <div class="lead-meta">
          ${meta.map(([label, val]) => `<div><div class="meta-label">${label}</div><div class="meta-value">${escapeHtml(val)}</div></div>`).join('')}
        </div>
        <div class="lead-actions">
          <a class="btn btn-3d-green" href="tel:${encodeURIComponent(lead.phone)}">📞 Call</a>
          ${mode === 'assigned'
            ? `<button class="btn btn-3d-dark" onclick="openDisposition('${lead.id}','${escapeHtml(lead.name)}')">Update Status</button>`
            : `<button class="btn btn-3d-gold" onclick="claimLead('${lead.id}')">🎯 Claim Lead</button>`}
        </div>
      </div>
    `;
  }

  async function loadLeads() {
    try {
      const { assigned, marketplace } = await api('/telecaller/leads');
      document.getElementById('statPill').textContent = `${assigned.length} assigned`;

      const assignedEl = document.getElementById('assignedList');
      assignedEl.innerHTML = assigned.length
        ? assigned.map((l) => leadCardHtml(l, 'assigned')).join('')
        : `<div class="card empty-state"><div class="empty-icon">📭</div>No leads assigned to you yet.<br/>Check the Marketplace tab for open leads.</div>`;

      const marketEl = document.getElementById('marketplaceList');
      marketEl.innerHTML = marketplace.length
        ? marketplace.map((l) => leadCardHtml(l, 'marketplace')).join('')
        : `<div class="card empty-state"><div class="empty-icon">🎯</div>No unclaimed leads right now. Check back soon!</div>`;
    } catch (err) { toast(err.message, 'error'); }
  }

  window.claimLead = async function (id) {
    try {
      await api(`/telecaller/leads/${id}/claim`, { method: 'POST' });
      toast('Lead claimed! It now appears in "My Leads".', 'success');
      loadLeads();
    } catch (err) { toast(err.message, 'error'); }
  };

  const modal = document.getElementById('dispositionModal');
  window.openDisposition = function (id, name) {
    activeLeadId = id;
    document.getElementById('dispositionLeadName').textContent = `Update status for ${name}`;
    modal.style.display = 'flex';
  };
  document.getElementById('cancelDisposition').addEventListener('click', () => { modal.style.display = 'none'; });

  modal.querySelectorAll('button[data-outcome]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!activeLeadId) return;
      try {
        await api(`/telecaller/leads/${activeLeadId}/disposition`, {
          method: 'POST',
          body: { outcome: btn.dataset.outcome },
        });
        modal.style.display = 'none';
        toast('Lead status updated!', 'success');
        loadLeads();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  loadLeads();
  setInterval(loadLeads, 20000); // light polling so claimed marketplace leads disappear for others
})();
