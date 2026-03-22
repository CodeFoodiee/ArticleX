
const FALLBACK_FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
const FIREBASE_CONFIG = window.FIREBASE_CONFIG || FALLBACK_FIREBASE_CONFIG;

const API_BASE = '/api';

const hasRealFirebaseConfig =
  !!FIREBASE_CONFIG &&
  !Object.values(FIREBASE_CONFIG).some((v) => String(v || '').includes('YOUR_'));

if (!firebase.apps.length && hasRealFirebaseConfig) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
const _auth = firebase.apps.length ? firebase.auth() : null;
const _storage = firebase.apps.length ? firebase.storage() : null;
const _analytics = (
  firebase.apps.length &&
  FIREBASE_CONFIG?.measurementId &&
  typeof firebase.analytics === 'function'
) ? firebase.analytics() : null;

function fbAuth() { return _auth; }
function fbStorage() { return _storage; }
function fbAnalytics() { return _analytics; }
function logAnalyticsEvent(name, params = {}) {
  if (!_analytics || !name) return;
  _analytics.logEvent(name, params);
}

const Auth = {
  currentUser: () => _auth?.currentUser || null,
  isLoggedIn: () => !!_auth?.currentUser,

  async getToken() {
    const u = _auth?.currentUser;
    return u ? u.getIdToken() : null;
  },

  getProfile() {
    try { return JSON.parse(sessionStorage.getItem('articlex_profile') || 'null'); }
    catch { return null; }
  },
  setProfile(d) { sessionStorage.setItem('articlex_profile', JSON.stringify(d)); },
  clearProfile() { sessionStorage.removeItem('articlex_profile'); },

  async signOut() {
    await _auth?.signOut();
    this.clearProfile();
  },
};

async function apiRequest(endpoint, options = {}) {
  const token   = await Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();

  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      throw new Error('Server returned invalid JSON. Check Functions/Hosting setup.');
    }
  } else {
    if (!res.ok) {
      throw new Error(`API request failed (${res.status}).`);
    }
    throw new Error('API is returning HTML instead of JSON. Verify Firebase Hosting rewrite to /api.');
  }

  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

async function uploadImage(file, folder = 'covers') {
  const user = _auth.currentUser;
  if (!user || !_storage) throw new Error('Must be signed in to upload');
  const ext  = file.name.split('.').pop();
  const path = `${folder}/${user.uid}/${Date.now()}.${ext}`;
  const snap = await _storage.ref(path).put(file);
  return snap.ref.getDownloadURL();
}

function onAuthReady(cb) {
  if (!_auth) {
    cb(null);
    return;
  }
  _auth.onAuthStateChanged(cb);
}

const Toast = {
  _c: null,
  _init() {
    if (this._c) return;
    this._c = document.getElementById('toast-container');
    if (!this._c) {
      this._c = document.createElement('div');
      this._c.id = 'toast-container';
      this._c.className = 'toast-container';
      document.body.appendChild(this._c);
    }
  },
  show(msg, type = 'info', ms = 3500) {
    this._init();
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span style="font-size:1.1rem">${icons[type]}</span><span>${msg}</span>`;
    this._c.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slideOut .3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, ms);
  },
  success: (m) => Toast.show(m, 'success'),
  error:   (m) => Toast.show(m, 'error'),
  info:    (m) => Toast.show(m, 'info'),
};

const Theme = {
  init() {
    document.documentElement.setAttribute('data-theme',
      localStorage.getItem('articlex_theme') || 'light');
    this._sync();
  },
  toggle() {
    const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    localStorage.setItem('articlex_theme', n);
    this._sync();
  },
  _sync() {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent =
      document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
  },
};

Theme.init();

function buildNavbar(fbUser) {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const profile = Auth.getProfile();
  const name    = profile?.username || fbUser?.displayName || fbUser?.email?.split('@')[0] || 'Me';
  const avatar  = profile?.avatar   || fbUser?.photoURL   || '';

  nav.innerHTML = `
    <div class="container">
      <div class="navbar-inner">
        <a href="index.html" class="logo">ArticleX</a>
        <div class="nav-search">
          <span class="nav-search-icon">🔍</span>
          <input type="text" id="nav-search-input" placeholder="Search articles…">
        </div>
        <div class="nav-links">
          ${fbUser ? `
            <a href="write.html" class="btn btn-primary btn-sm">✍️ Write</a>
            <div class="dropdown" id="user-dd">
              <button class="avatar" id="dd-trigger" title="${esc(name)}">
                <span class="avatar-initial">${name[0].toUpperCase()}</span>
                <span class="avatar-name">${esc(name)}</span>
              </button>
              <div class="dropdown-menu">
                <div style="padding:10px 12px 6px;font-size:.8rem;color:var(--text-muted)">
                  ${esc(fbUser.email)}
                </div>
                <div class="dropdown-divider"></div>
                <a href="profile.html" class="dropdown-item">👤 My Profile</a>
                <a href="write.html"   class="dropdown-item">✍️ Write Article</a>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item danger" id="logout-btn">🚪 Sign Out</button>
              </div>
            </div>` : `
            <a href="login.html"  class="btn-ghost btn">Sign in</a>
            <a href="signup.html" class="btn btn-primary btn-sm">Get started</a>`}
          <button class="theme-toggle" id="theme-toggle">🌙</button>
        </div>
      </div>
    </div>`;

  Theme._sync();

  document.getElementById('theme-toggle')
    ?.addEventListener('click', () => Theme.toggle());

  const dd = document.getElementById('user-dd');
  document.getElementById('dd-trigger')
    ?.addEventListener('click', e => { e.stopPropagation(); dd?.classList.toggle('open'); });
  document.addEventListener('click', () => dd?.classList.remove('open'), { once: false });

  document.getElementById('logout-btn')
    ?.addEventListener('click', async () => {
      await Auth.signOut();
      Toast.success('Signed out');
      setTimeout(() => window.location.href = 'index.html', 600);
    });

  const si = document.getElementById('nav-search-input');
  const q  = new URLSearchParams(location.search).get('search');
  if (si && q) si.value = q;
  si?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && si.value.trim())
      window.location.href = `index.html?search=${encodeURIComponent(si.value.trim())}`;
  });
}

function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}
const escapeHtml = esc;

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCategoryEmoji(tags = []) {
  const map = {
    tech:'💻', code:'💻', programming:'💻', science:'🔬', health:'💊',
    fitness:'🏋️', travel:'✈️', food:'🍜', art:'🎨', music:'🎵',
    business:'💼', finance:'📈', design:'✏️', politics:'🏛️',
    sports:'⚽', culture:'🌐', education:'📚', nature:'🌿',
  };
  for (const t of tags)
    for (const [k, v] of Object.entries(map))
      if (t.includes(k)) return v;
  return '📝';
}

function filterByTag(tag) {
  window.location.href = `index.html?tag=${encodeURIComponent(tag)}`;
}

function renderArticleCard(a) {
  const author    = a.author || {};
  const date      = new Date(a.createdAt).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
  const tagsHtml  = (a.tags || []).slice(0, 2)
    .map(t => `<span class="tag"
      onclick="event.stopPropagation();filterByTag('${esc(t)}')">${esc(t)}</span>`).join('');
  const articleId = a.id || a._id;
  const likes     = a.likeCount ?? a.likes?.length ?? 0;

  return `
    <div class="article-card"
      onclick="window.location.href='article.html?id=${articleId}'">
      <div class="card-image">
        ${a.image
          ? `<img src="${a.image}" alt="${esc(a.title)}" loading="lazy">`
          : `<div class="card-image-placeholder">${getCategoryEmoji(a.tags)}</div>`}
      </div>
      <div class="card-body">
        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
        <h3 class="card-title">${esc(a.title)}</h3>
        <p class="card-excerpt">${esc(a.excerpt || '')}</p>
        <div class="card-footer">
          <div class="card-author">
            <div class="avatar" style="width:32px;height:32px;font-size:.75rem">
              ${author.avatar
                ? `<img src="${author.avatar}" alt="${esc(author.username)}">`
                : (author.username || 'U')[0].toUpperCase()}
            </div>
            <div class="card-author-info">
              <span class="card-author-name">${esc(author.username || 'Anonymous')}</span>
              <span class="card-meta">${date}</span>
            </div>
          </div>
          <div class="card-stats">
            <span class="card-stat">❤️ ${likes}</span>
            <span class="card-stat">👁 ${a.views || 0}</span>
            <span class="read-time">📖 ${a.readTime || 1}m</span>
          </div>
        </div>
      </div>
    </div>`;
}

function requireAuth(redirect = 'login.html') {
  if (!_auth.currentUser) {
    Toast.info('Please sign in to continue');
    setTimeout(() => window.location.href = redirect, 800);
    return false;
  }
  return true;
}

function showModal(title, text, onConfirm) {
  let o = document.getElementById('confirm-modal');
  if (!o) {
    o = document.createElement('div');
    o.id = 'confirm-modal';
    o.className = 'modal-overlay';
    o.innerHTML = `
      <div class="modal">
        <h3 class="modal-title" id="m-title"></h3>
        <p  class="modal-text"  id="m-text"></p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="m-cancel">Cancel</button>
          <button class="btn btn-danger"    id="m-confirm">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(o);
  }
  document.getElementById('m-title').textContent = title;
  document.getElementById('m-text').textContent  = text;
  o.classList.add('open');
  const close = () => o.classList.remove('open');
  document.getElementById('m-cancel').onclick  = close;
  o.onclick = e => { if (e.target === o) close(); };
  document.getElementById('m-confirm').onclick = () => { close(); onConfirm(); };
}

document.addEventListener('DOMContentLoaded', () => {
  Toast._init();
  logAnalyticsEvent('page_view', {
    page_path: window.location.pathname,
    page_title: document.title,
  });
  if (!hasRealFirebaseConfig) {
    Toast.info('Firebase is not configured yet. Add your config to enable auth and API calls.', 5000);
  }

  buildNavbar(null);

  onAuthReady(fbUser => {
    buildNavbar(fbUser);
    if (fbUser && !Auth.getProfile()) {
      apiRequest('/auth/me').then(p => Auth.setProfile(p)).catch(() => {});
    }
    if (!fbUser) Auth.clearProfile();
  });
});
