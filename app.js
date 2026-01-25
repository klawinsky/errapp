/* app.js — Supabase integration for employees (CDN UMD)
   Wymagane elementy w HTML: #app-status, #login-container, #main-menu, #stations, #user-info, #access-denied
   Sprawdza rolę użytkownika w tabeli 'profiles' (kolumna 'role' == 'employee').
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

function setUserInfo(text) {
  const el = document.getElementById('user-info');
  if (el) el.textContent = text || '';
}

/* -------------------------
   Inicjalizacja Supabase
   ------------------------- */
let supabase = null;

async function initSupabase() {
  if (supabase) return supabase;

  const cfg = window.__APP_CONFIG__ || {};
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Brak konfiguracji Supabase w window.__APP_CONFIG__');
  }

  if (typeof createClient === 'function') {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else if (window?.supabase?.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    throw new Error('Supabase client not available. Dołącz @supabase/supabase-js lub CDN UMD.');
  }

  return supabase;
}

/* -------------------------
   Autoryzacja i weryfikacja pracownika
   ------------------------- */
async function ensureAuthenticatedAndAuthorized() {
  try {
    if (!supabase) await initSupabase();

    // Pobierz sesję
    let session = null;
    try {
      const res = await supabase.auth.getSession();
      session = res?.data?.session ?? null;
    } catch (err) {
      warn('Błąd supabase.auth.getSession()', err);
      session = null;
    }

    if (!session) {
      showStatus('Brak aktywnej sesji — proszę się zalogować', 'warn');
      showLoginUI();
      return null;
    }

    // Weryfikacja: sprawdź profil użytkownika w tabeli 'profiles'
    // Zakładamy strukturę: profiles (id = auth.uid, email, role)
    const userId = session.user?.id;
    if (!userId) {
      showStatus('Nieprawidłowa sesja (brak user id)', 'error');
      showLoginUI();
      return null;
    }

    // Pobierz profil
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id,email,role')
      .eq('id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      warn('Błąd pobierania profilu', error);
      showStatus('Błąd weryfikacji uprawnień', 'error');
      return null;
    }

    const profile = profiles ?? null;
    if (!profile) {
      showStatus('Brak profilu użytkownika — brak dostępu', 'error');
      document.getElementById('access-denied')?.classList.remove('hidden');
      return null;
    }

    // Sprawdź rolę
    if (profile.role !== 'employee') {
      showStatus('Konto nie ma roli employee — brak dostępu', 'error');
      setUserInfo(profile.email || profile.id);
      document.getElementById('access-denied')?.classList.remove('hidden');
      return null;
    }

    // Sukces: użytkownik jest pracownikiem
    setUserInfo(profile.email || profile.id);
    showStatus(`Zalogowany jako ${profile.email || profile.id}`, 'ok');
    onUserAuthenticated(session, profile);
    return { session, profile };
  } catch (err) {
    error('ensureAuthenticatedAndAuthorized error', err);
    showStatus('Błąd autoryzacji', 'error');
    return null;
  }
}

/* Subskrypcja zmian auth (np. login/logout w innej karcie) */
function subscribeAuthChanges() {
  if (!supabase?.auth?.onAuthStateChange) {
    warn('subscribeAuthChanges: supabase.auth.onAuthStateChange not available');
    return;
  }
  supabase.auth.onAuthStateChange(async (event, session) => {
    log('Auth state change', event, session);
    if (session) {
      // Po zmianie stanu spróbuj ponownie zweryfikować uprawnienia
      await ensureAuthenticatedAndAuthorized();
    } else {
      showStatus('Wylogowano lub brak sesji', 'warn');
      setUserInfo('');
      document.getElementById('main-menu')?.replaceChildren();
      document.getElementById('access-denied')?.classList.add('hidden');
      showLoginUI();
    }
  });
}

/* -------------------------
   UI: login, menu, stacje
   ------------------------- */
function showLoginUI() {
  const loginContainer = document.getElementById('login-container');
  if (!loginContainer) {
    warn('Brak elementu #login-container w DOM');
    return;
  }

  loginContainer.innerHTML = `
    <div>
      <button id="login-email-btn">Zaloguj (magic link)</button>
      <button id="login-google-btn">Zaloguj przez Google</button>
      <span id="login-note"></span>
    </div>
  `;

  document.getElementById('login-email-btn')?.addEventListener('click', async () => {
    const email = prompt('Podaj służbowy email:');
    if (!email) return;
    showStatus('Wysyłanie linku logowania...', 'info');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      showStatus('Wysłano link logowania na email', 'ok');
      document.getElementById('login-note').textContent = 'Sprawdź skrzynkę służbową (magic link).';
    } catch (err) {
      error('Błąd wysyłania magic link', err);
      showStatus('Błąd logowania email', 'error');
    }
  });

  document.getElementById('login-google-btn')?.addEventListener('click', async () => {
    showStatus('Przekierowanie do Google...', 'info');
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) throw error;
    } catch (err) {
      error('Błąd OAuth', err);
      showStatus('Błąd logowania przez Google', 'error');
    }
  });
}

function buildMenuForUser(profile) {
  const menu = document.getElementById('main-menu');
  if (!menu) {
    warn('Brak elementu #main-menu w DOM');
    return;
  }
  menu.innerHTML = `
    <ul>
      <li><button id="menu-home">Strona główna</button></li>
      <li><button id="menu-stations">Stacje</button></li>
      <li><button id="menu-refresh">Odśwież dane</button></li>
      <li><button id="menu-logout">Wyloguj</button></li>
    </ul>
  `;
  document.getElementById('menu-stations')?.addEventListener('click', () => loadProtectedData());
  document.getElementById('menu-refresh')?.addEventListener('click', () => loadProtectedData());
  document.getElementById('menu-logout')?.addEventListener('click', async () => {
    try {
      await supabase.auth.signOut();
      showStatus('Wylogowano', 'warn');
      setUserInfo('');
      document.getElementById('main-menu')?.replaceChildren();
      document.getElementById('access-denied')?.classList.add('hidden');
      showLoginUI();
    } catch (err) {
      error('Błąd wylogowania', err);
      showStatus('Błąd wylogowania', 'error');
    }
  });
}

/* -------------------------
   Pobieranie chronionych danych z Supabase
   ------------------------- */
async function loadProtectedData() {
  try {
    showStatus('Wczytywanie stacji...', 'info');

    // Pobieramy dane z tabeli 'stations' — upewnij się, że RLS i uprawnienia są poprawnie ustawione
    const { data, error } = await supabase
      .from('stations')
      .select('id,name,location')
      .order('id', { ascending: true })
      .limit(500);

    if (error) throw error;

    const stations = Array.isArray(data) ? data : [];
    renderStationsList(stations);
    showStatus(`Stacje załadowane: ${stations.length}`, 'ok');
  } catch (err) {
    error('loadProtectedData error', err);
    showStatus('Błąd wczytywania danych (fallback do przykładowych)', 'error');
    renderStationsList(); // fallback
  }
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
  container.innerHTML = stations.map(s => {
    const loc = s.location ? ` — ${s.location}` : '';
    return `<div class="station" data-id="${s.id}">${s.name}${loc}</div>`;
  }).join('');
  enableAppFunctions();
}

function enableAppFunctions() {
  document.querySelectorAll('.station').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      showStatus(`Wybrano stację ${id}`, 'info');
      // tutaj dodaj logikę otwierania szczegółów / edycji (jeśli uprawnienia)
    });
  });
}

/* -------------------------
   Akcje po uwierzytelnieniu
   ------------------------- */
function onUserAuthenticated(session, profile) {
  document.getElementById('access-denied')?.classList.add('hidden');
  buildMenuForUser(profile);
  loadProtectedData();
}

/* -------------------------
   Inicjalizacja aplikacji
   ------------------------- */
async function initApp() {
  log('app.js loaded');
  showStatus('Inicjalizacja aplikacji...', 'info');

  try {
    await initSupabase();
    log('Supabase init done', !!supabase);
  } catch (err) {
    error('Supabase init failed', err);
    showStatus('Błąd inicjalizacji Supabase', 'error');
    return;
  }

  try {
    subscribeAuthChanges();
  } catch (err) {
    warn('subscribeAuthChanges failed', err);
  }

  // Główna ścieżka: sprawdź sesję i uprawnienia
  await ensureAuthenticatedAndAuthorized();

  // Wczytaj publiczne stacje jako fallback (opcjonalne)
  try {
    const publicStations = Array.from({length: 15}, (_, i) => ({ id: i+1, name: `Stacja ${i+1}` }));
    renderStationsList(publicStations);
    if (!supabase) {
      showStatus('No active session — waiting for user to login', 'warn');
    }
  } catch (err) {
    warn('Error loading fallback stations', err);
  }
}

/* Start po załadowaniu DOM */
document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(err => {
    error('initApp uncaught error', err);
    showStatus('Błąd inicjalizacji aplikacji', 'error');
  });
});
