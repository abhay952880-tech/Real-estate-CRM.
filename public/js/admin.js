(function () {
  const user = Auth.requireRole('broker');
  if (!user) return;

  document.getElementById('companyNameLabel').textContent = user.companyName || 'Estatia CRM';
  document.getElementById('logoutBtn').addEventListener('click', Auth.logout);

  let locations = [];
  let budgets = [];

  // ---------------- Tab switching ----------------
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

  // ---------------- Overview ----------------
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
