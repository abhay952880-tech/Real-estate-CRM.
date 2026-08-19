(function () {
  // Redirect if already logged in
  const existingUser = Auth.getUser();
  if (existingUser && Auth.getToken()) {
    window.location.href = existingUser.role === 'broker' ? '/admin.html' : '/telecaller.html';
    return;
  }

  let selectedRole = 'broker';
  const roleToggle = document.getElementById('roleToggle');
  roleToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-role]');
    if (!btn) return;
    selectedRole = btn.dataset.role;
    [...roleToggle.children].forEach((b) => b.classList.toggle('active', b === btn));
  });

  document.getElementById('showSignup').addEventListener('click', () => {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('signupView').style.display = 'block';
  });
  document.getElementById('showLogin').addEventListener('click', () => {
    document.getElementById('signupView').style.display = 'none';
    document.getElementById('loginView').style.display = 'block';
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';
    try {
      const data = await api('/auth/login', { method: 'POST', auth: false, body: { email, password, role: selectedRole } });
      Auth.setSession(data.token, data.user);
      toast('Welcome back!', 'success');
      setTimeout(() => {
        window.location.href = selectedRole === 'broker' ? '/admin.html' : '/telecaller.html';
      }, 300);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Log In';
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('signupBtn');
    const companyName = document.getElementById('suCompany').value.trim();
    const phone = document.getElementById('suPhone').value.trim();
    const email = document.getElementById('suEmail').value.trim();
    const password = document.getElementById('suPassword').value;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating…';
    try {
      const data = await api('/auth/broker/signup', { method: 'POST', auth: false, body: { companyName, phone, email, password } });
      Auth.setSession(data.token, data.user);
      toast('Workspace created! Let\'s finish setup.', 'success');
      setTimeout(() => { window.location.href = '/admin.html?onboarding=1'; }, 300);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Create Account & Continue';
    }
  });
})();
