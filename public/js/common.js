/* Shared helpers used across every page */

const Auth = {
  getToken() { return localStorage.getItem('crm_token'); },
  getUser() {
    try { return JSON.parse(localStorage.getItem('crm_user') || 'null'); }
    catch (e) { return null; }
  },
  setSession(token, user) {
    localStorage.setItem('crm_token', token);
    localStorage.setItem('crm_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
  },
  requireRole(role) {
    const user = Auth.getUser();
    const token = Auth.getToken();
    if (!token || !user || user.role !== role) {
      window.location.href = '/';
      return null;
    }
    return user;
  },
  logout() {
    Auth.clear();
    window.location.href = '/';
  },
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = Auth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    if (res.status === 401) {
      Auth.clear();
      toast(message, 'error');
      setTimeout(() => (window.location.href = '/'), 900);
    }
    throw new Error(message);
  }
  return data;
}

function toast(message, type = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadgeClass(status) {
  switch (status) {
    case 'Connected': return 'badge-connected';
    case 'Failed': return 'badge-failed';
    case 'Unclaimed': return 'badge-unclaimed';
    default: return 'badge-new';
  }
}
