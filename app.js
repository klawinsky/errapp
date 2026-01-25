/* app.js — bezpieczna inicjalizacja Supabase (singleton)
   Zastępuje wcześniejsze deklaracje supabase i zapobiega błędowi "already been declared".
   Wymagane elementy w HTML: #app-status, #login-container, #main-menu, #stations
*/

const DEBUG = true;
function log(...args) { if (DEBUG) console.log(...args); }
function warn(...args) { console.warn(...args); }
function error(...args) { console.error(...args); }

function showStatus(text, level = 'info') {
  const el = document.getElementById('app-status');
  if (el) {
    el.textContent = text;
    el.className = `status ${level}`;
  } else {
    if (level === 'error') error(text); else log(text);
  }
}

/* -------------------------
   Singleton init Supabase
   ------------------------- */
/*
  Uwaga: nie deklarujemy globalnej zmiennej 'supabase' bezpośrednio.
  Zamiast tego korzystamy z getSupabase() — zwraca istniejącą instancję lub tworzy nową.
*/
const getSupabase = (() => {
  // lokalne zamknięcie przechowujące instancję
  let instance = window.__APP_SUPABASE_CLIENT__ || null;

  return async function init() {
    if (instance) return instance;

    const cfg = window.__APP_CONFIG__ || {};
    const SUPABASE_URL = cfg.SUPABASE_URL;
    const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Brak konfiguracji Supabase w window.__APP_CONFIG__');
    }

    // Obsługa CDN UMD (window.supabase.createClient) lub bundlera (createClient)
    if (typeof createClient === 'function') {
      instance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else if (window?.supabase?.createClient) {
      instance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      throw new Error('Supabase client not available. Dołącz @supabase/supabase-js lub CDN UMD.');
    }

    // zapisz globalnie, by inne skrypty mogły użyć tej samej instancji
    try { window.__APP_SUPABASE_CLIENT__ = instance; } catch (e) { /* ignore */ }

    return instance;
  };
})();

/* -------------------------
   Funkcje aplikacji (używają getSupabase())
   ------------------------- */

async function ensureAuthenticatedOrShowLogin() {
  try {
    const supabase = await getSupabase();

    let session = null;
    try {
      const res = await supabase.auth.getSession();
      session = res?.data?.session ?? null;
    } catch (err) {
      warn('Błąd podczas supabase.auth.getSession()', err);
      session = null;
    }

    if (session) {
      log('Sesja aktywna:', session);
      showStatus(`Zalogowany jako ${session.user?.email ?? session.user?.id ?? 'użytkownik'}`, 'ok');
      onUserAuthenticated(session);
      return session;
    } else {
      log('No active session — waiting for user to login');
      showStatus('Brak aktywnej sesji — proszę się zalogować', 'warn');
      showLoginUI();
      return null;
    }
  } catch (err) {
    error('ensureAuthenticatedOrShowLogin error', err);
    showStatus('Błąd inicjalizacji uwierzytelniania', 'error');
    showLoginUI();
    return null;
  }
}

function subscribeAuthChanges() {
  // subskrypcja bezpośrednio po uzyskaniu klienta
  getSupabase().then(supabase => {
    if (!supabase?.auth?.onAuthStateChange) {
      warn('subscribeAuthChanges: supabase.auth.onAuthStateChange not available');
      return;
    }
    supabase.auth.onAuthStateChange((event, session) => {
      log('Auth state change', event, session);
      if (session) {
        showStatus('Sesja aktywna', 'ok');
        onUserAuthenticated(session);
      } else {
        showStatus('Wylogowano lub brak sesji', 'warn');
        document.getElementById('main-menu')?.replaceChildren();
        showLoginUI();
      }
    });
  }).catch(err => {
    warn('subscribeAuthChanges init failed', err);
  });
}

/* UI i logika */
function showLoginUI() {
  const loginContainer = document.getElementById('login-container');
  if (!loginContainer) {
    warn('Brak elementu #login-container w DOM');
    return;
  }

  loginContainer.innerHTML = `
    <div>
      <button id="login-email-btn">Zaloguj przez email (magic link)</button>
      <button id="login-google-btn">Zaloguj przez Google</button>
      <span id="login-note"></span>
    </div>
  `;

  document.getElementById('login-email-btn')?.addEventListener('click', async () => {
    const email = prompt('Podaj email do logowania (magic link):');
    if (!email) return;
    showStatus('Wysyłanie linku logowania...', 'info');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      showStatus('Wysłano link logowania na email', 'ok');
      document.getElementById('login-note').textContent = 'Sprawdź skrzynkę pocztową (magic link).';
    } catch (err) {
      error('Błąd wysyłania magic link', err);
      showStatus('Błąd logowania email', 'error');
    }
  });

  document.getElementById('login-google-btn')?.addEventListener('click', async () => {
    showStatus('Przekierowanie do Google...', 'info');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) throw error;
    } catch (err) {
      error('Błąd OAuth', err);
      showStatus('Błąd logowania przez Google', 'error');
    }
  });
}

function buildMenuForUser(session) {
  const menu = document.getElementById('main-menu');
  if (!menu) {
    warn('Brak elementu #main-menu w DOM');
    return;
  }
  menu.innerHTML = `
    <ul>
      <li><button id="menu-home">Strona główna</button></li>
      <li><button id="menu-stations">Stacje</button></li>
      <li><button id="menu-logout">Wyloguj</button></li>
    </ul>
  `;
  document.getElementById('menu-stations')?.addEventListener('click', () => renderStationsList());
  document.getElementById('menu-logout')?.addEventListener('click', async () => {
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
      showStatus('Wylogowano', 'warn');
      menu.innerHTML = '';
      showLoginUI();
    } catch (err) {
      error('Błąd wylogowania', err);
      showStatus('Błąd wylogowania', 'error');
    }
  });
}

function renderStationsList(stations = []) {
  const container = document.getElementById('stations');
  if (!container) {
    warn('Brak elementu #stations w DOM');
    return;
  }
  if (!stations || stations.length === 0) {
    stations = Array.from({length: 15}, (_, i) => ({ id: i+1, name: `Stacja ${i+1}` }));
  }
  container.innerHTML = stations.map(s => `<div class="station" data-id="${s.id}">${s.name}</div>`).join('');
  enableAppFunctions();
}

function enableAppFunctions() {
  document.querySelectorAll('.station').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      showStatus(`Wybrano stację ${id}`, 'info');
    });
  });
}

async function loadProtectedData() {
  try {
    showStatus('Wczytywanie stacji...', 'info');
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('stations')
      .select('id,name')
      .order('id', { ascending: true })
      .limit(100);
    if (error) throw error;
    renderStationsList(Array.isArray(data) ? data : []);
    showStatus(`Stacje załadowane: ${Array.isArray(data) ? data.length : 0}`, 'ok');
  } catch (err) {
    error('loadProtectedData error', err);
    showStatus('Błąd wczytywania danych (fallback)', 'error');
    renderStationsList();
  }
}

function onUserAuthenticated(session) {
  buildMenuForUser(session);
  loadProtectedData();
}

/* -------------------------
   Inicjalizacja aplikacji
   ------------------------- */
async function initApp() {
  log('app.js loaded');
  showStatus('Inicjalizacja aplikacji...', 'info');

  try {
    await getSupabase();
    log('Supabase init done');
  } catch (err) {
    error('Supabase init failed', err);
    showStatus('Błąd inicjalizacji Supabase', 'error');
    return;
  }

  subscribeAuthChanges();
  await ensureAuthenticatedOrShowLogin();

  // fallback public stations
  try {
    const publicStations = Array.from({length: 15}, (_, i) => ({ id: i+1, name: `Stacja ${i+1}` }));
    renderStationsList(publicStations);
  } catch (err) {
    warn('Error loading fallback stations', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(err => {
    error('initApp uncaught error', err);
    showStatus('Błąd inicjalizacji aplikacji', 'error');
  });
});
