/* app.js — kompletny plik aplikacji z Supabase, obsługą raportów, Dyspo auto-refresh,
   autocomplete stacji, modalami, service worker handling i poprawioną obsługą sidebar/hamburgera */

console.log('app.js loaded');

const sb = (typeof window !== 'undefined' && window.supabase) ? window.supabase : null;
const qs = (s, r = document) => (r || document).querySelector(s);
const qsa = (s, r = document) => Array.from((r || document).querySelectorAll(s));
function escapeHtml(s){ if (s === 0) return "0"; if (!s) return ""; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

let currentReportId = null;
let readOnlyMode = false;

/* ---------- Stations autocomplete ---------- */
let STATIONS = [];
async function initStations() {
  try {
    const res = await fetch('stations.json', { cache: "no-cache" });
    if (!res.ok) throw new Error('stations.json fetch failed');
    STATIONS = await res.json();
    STATIONS.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    console.log('Stations loaded:', STATIONS.length);
  } catch (e) {
    console.warn('Nie udało się wczytać stations.json', e);
    STATIONS = [];
  }
}

function findStations(query, limit = 30) {
  if (!query) return STATIONS.slice(0, limit);
  const q = query.trim().toLowerCase();
  const pref = STATIONS.filter(s => (s.name||'').toLowerCase().startsWith(q) || (s.code||'').toLowerCase().startsWith(q));
  if (pref.length >= limit) return pref.slice(0, limit);
  const rest = STATIONS.filter(s => !pref.includes(s) && ((s.name||'').toLowerCase().includes(q) || (s.code||'').toLowerCase().includes(q)));
  return pref.concat(rest).slice(0, limit);
}

function attachStationAutocomplete(inputEl, listEl) {
  if (!inputEl || !listEl) return;
  let focusedIndex = -1;
  let currentItems = [];

  function renderList(items) {
    listEl.innerHTML = '';
    if (!items || items.length === 0) {
      const no = document.createElement('div'); no.className = 'no-results'; no.textContent = 'Brak wyników — wpisz nazwę ręcznie';
      listEl.appendChild(no);
      listEl.classList.remove('hidden');
      currentItems = [];
      focusedIndex = -1;
      return;
    }
    items.forEach((s, idx) => {
      const div = document.createElement('div');
      div.className = 'item';
      div.setAttribute('role','option');
      div.dataset.index = idx;
      div.innerHTML = `<strong>${escapeHtml(s.name)}</strong><div style="font-size:12px;color:var(--muted)">${escapeHtml(s.code || '')}</div>`;
      div.addEventListener('click', () => selectItem(idx));
      listEl.appendChild(div);
    });
    listEl.classList.remove('hidden');
    currentItems = items;
    focusedIndex = -1;
  }

  function selectItem(idx) {
    const s = currentItems[idx];
    if (!s) return;
    inputEl.value = s.name;
    inputEl.dataset.stationCode = s.code || '';
    hideList();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function hideList() {
    listEl.classList.add('hidden');
    focusedIndex = -1;
  }

  function onInput() {
    const q = inputEl.value || '';
    const items = findStations(q, 30);
    renderList(items);
  }

  function onKeyDown(e) {
    if (listEl.classList.contains('hidden')) return;
    const items = listEl.querySelectorAll('.item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      updateFocus(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      updateFocus(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0) selectItem(focusedIndex);
      else hideList();
    } else if (e.key === 'Escape') {
      hideList();
    }
  }

  function updateFocus(items) {
    items.forEach((it, i) => it.classList.toggle('active', i === focusedIndex));
    if (focusedIndex >= 0 && items[focusedIndex]) items[focusedIndex].scrollIntoView({block:'nearest'});
  }

  function onDocClick(e) {
    if (e.target === inputEl || e.target.closest('.autocomplete') === inputEl.closest('.autocomplete')) return;
    hideList();
  }

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onDocClick);

  return { hideList };
}

/* ---------- Auth ---------- */
async function ensureAuthenticatedOrRedirect() {
  try {
    const { data } = await sb.auth.getSession();
    if (!data?.session) { window.location.href = 'login.html'; return false; }
    sessionStorage.setItem('eRJ_user', data.session.user.id);
    const emailEl = qs('#user-email-display');
    if (emailEl) emailEl.textContent = data.session.user.email || '';
    return true;
  } catch (e) {
    console.warn('auth check error', e);
    window.location.href = 'login.html';
    return false;
  }
}
async function getCurrentUid() {
  const s = sessionStorage.getItem('eRJ_user');
  if (s) return s;
  try { const { data } = await sb.auth.getUser(); return data?.user?.id || null; } catch(e){ return null; }
}

/* ---------- DB mapping & CRUD ---------- */
function mapDbReportToUi(r) {
  if (!r) return null;
  return {
    id: r.id, status: r.status, created_by: r.created_by, created_at: r.created_at,
    general: { trainNumber: r.train_number || '', date: r.date || '', from: r.from_station || '', to: r.to_station || '' },
    consist: r.consist || [], crew: r.crew || [], runs: r.runs || [], dispos: r.dispos || [], remarks: r.remarks || []
  };
}

async function loadReports() {
  const uid = await getCurrentUid();
  if (!uid || !sb) return [];
  const { data, error } = await sb.from('reports').select('*, consist(*), crew(*), runs(*), dispos(*), remarks(*)').eq('created_by', uid).order('created_at', { ascending: true });
  if (error) { console.error('loadReports error', error); return []; }
  return (data || []).map(mapDbReportToUi);
}

async function getReportById(id) {
  if (!id || !sb) return null;
  const { data, error } = await sb.from('reports').select('*, consist(*), crew(*), runs(*), dispos(*), remarks(*)').eq('id', id).single();
  if (error) { console.error('getReportById error', error); return null; }
  return mapDbReportToUi(data);
}

async function createEmptyReport() {
  const uid = await getCurrentUid();
  if (!sb) { console.error('createEmptyReport: sb not initialized'); return null; }
  const payload = { status: 'in_progress', train_number: '', date: null, from_station: '', to_station: '', created_by: uid };
  const { data, error } = await sb.from('reports').insert([payload]).select().single();
  if (error) { console.error('createEmptyReport error', error); return null; }
  return mapDbReportToUi(data);
}

async function updateReportFields(id, fields) {
  if (!id || !sb) {
    console.error('updateReportFields: missing id or supabase client');
    return null;
  }

  try {
    const allowed = ['train_number', 'date', 'from_station', 'to_station', 'status'];
    const payload = {};
    Object.keys(fields || {}).forEach(key => {
      if (allowed.includes(key)) payload[key] = fields[key];
    });
    if (Object.keys(payload).length === 0) {
      console.warn('updateReportFields: no allowed fields to update', fields);
      return null;
    }
    const { data, error, status } = await sb.from('reports').update(payload).eq('id', id).select().single();
    if (error) {
      try { console.error('updateReportFields error', { status, error: JSON.parse(JSON.stringify(error)) }); }
      catch(e) { console.error('updateReportFields error (raw)', status, error); }
      return null;
    }
    return mapDbReportToUi(data);
  } catch (ex) {
    console.error('updateReportFields exception', ex);
    return null;
  }
}

/* related records */
async function addConsist(reportId, type, mark, fromStation, toStation) {
  if (!reportId || !sb) return null;
  const { data, error } = await sb.from('consist').insert([{ report_id: reportId, type, mark, from_station: fromStation || '', to_station: toStation || '' }]).select();
  if (error) console.error('addConsist error', error);
  return data;
}
async function addCrew(reportId, name, role, fromStation, toStation) {
  if (!reportId || !sb) return null;
  const { data, error } = await sb.from('crew').insert([{ report_id: reportId, name, role, from_station: fromStation || '', to_station: toStation || '' }]).select();
  if (error) console.error('addCrew error', error);
  return data;
}
async function addRun(reportId, station, plannedArr, actualArr, plannedDep, actualDep, delayReason, orders) {
  if (!reportId || !sb) return null;
  const payload = [{
    report_id: reportId,
    station,
    planned_arr: plannedArr || null,
    actual_arr: actualArr || null,
    planned_dep: plannedDep || null,
    actual_dep: actualDep || null,
    delay_reason: delayReason || '',
    orders: orders || ''
  }];
  const { data, error } = await sb.from('runs').insert(payload).select();
  if (error) console.error('addRun error', error);
  return data;
}
async function addDispo(reportId, source, text) {
  if (!reportId || !sb) return null;
  const { data, error } = await sb.from('dispos').insert([{ report_id: reportId, source, text }]).select();
  if (error) console.error('addDispo error', error);
  return data;
}
async function addRemark(reportId, text) {
  if (!reportId || !sb) return null;
  const { data, error } = await sb.from('remarks').insert([{ report_id: reportId, text }]).select();
  if (error) console.error('addRemark error', error);
  return data;
}
async function deleteRow(table, id) {
  if (!table || !id || !sb) return null;
  const { data, error } = await sb.from(table).delete().eq('id', id);
  if (error) console.error('deleteRow error', error);
  return data;
}
async function updateRow(table, id, fields) {
  if (!table || !id || !sb) return null;
  const { data, error } = await sb.from(table).update(fields).eq('id', id).select();
  if (error) console.error('updateRow error', error);
  return data;
}

/* ---------- Render helpers (data-label added) ---------- */
function updateStatusLabel(report) {
  const label = qs("#report-status-label");
  if (!label) return;
  if (!report) { label.textContent = ""; return; }
  if (report.status === "finished") label.textContent = "Status: Zakończona (tylko do odczytu)";
  else if (report.status === "handed_over") label.textContent = "Status: Przekazana do przejęcia";
  else label.textContent = "Status: W trakcie prowadzenia";
}

function renderConsist(report) {
  const locoTbody = qs("#loco-table tbody"); const wagonTbody = qs("#wagon-table tbody");
  if (locoTbody) locoTbody.innerHTML = "";
  if (wagonTbody) wagonTbody.innerHTML = "";
  (report?.consist || []).forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Oznaczenie">${escapeHtml(l.mark)}</td>
      <td data-label="Od">${escapeHtml(l.from_station)}</td>
      <td data-label="Do">${escapeHtml(l.to_station)}</td>
      <td data-label="Akcje" class="action-group">
        <button class="btn small" data-role="edit" data-type="consist" data-id="${l.id}">Edytuj</button>
        <button class="btn warning small" data-role="delete" data-type="consist" data-id="${l.id}">Usuń</button>
      </td>`;
    if (l.type === 'loco') locoTbody.appendChild(tr); else wagonTbody.appendChild(tr);
  });
}

function renderCrew(report) {
  const tbody = qs("#crew-table tbody"); if (!tbody) return; tbody.innerHTML = "";
  (report?.crew || []).forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Imię i nazwisko">${escapeHtml(c.name)}</td>
      <td data-label="Funkcja">${escapeHtml(c.role)}</td>
      <td data-label="Od">${escapeHtml(c.from_station)}</td>
      <td data-label="Do">${escapeHtml(c.to_station)}</td>
      <td data-label="Akcje" class="action-group">
        <button class="btn small" data-role="edit" data-type="crew" data-id="${c.id}">Edytuj</button>
        <button class="btn warning small" data-role="delete" data-type="crew" data-id="${c.id}">Usuń</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// Poprawiona funkcja licząca opóźnienie w minutach
function calculateDelayMinutes(planned, actual) {
  if (!planned) return null;
  const p = new Date(planned);
  if (isNaN(p.getTime())) return null;
  if (actual) {
    const a = new Date(actual);
    if (isNaN(a.getTime())) return null;
    return Math.round((a.getTime() - p.getTime()) / 60000);
  }
  const now = new Date();
  if (now.getTime() < p.getTime()) return null;
  return Math.round((now.getTime() - p.getTime()) / 60000);
}

function formatDelayCell(delay) {
  if (delay === null) return "";
  if (delay < 0) return `${delay} min`;
  if (delay > 0) return `+${delay} min`;
  return `0 min`;
}

function renderRuns(report) {
  const tbody = qs("#run-table tbody"); if (!tbody) return; tbody.innerHTML = "";
  (report?.runs || []).forEach(r => {
    const delayArr = calculateDelayMinutes(r.planned_arr, r.actual_arr);
    const delayDep = calculateDelayMinutes(r.planned_dep, r.actual_dep);
    const repDelay = (delayArr === null && delayDep === null) ? null : (delayArr === null ? delayDep : (delayDep === null ? delayArr : (Math.abs(delayArr) >= Math.abs(delayDep) ? delayArr : delayDep)));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Stacja">${escapeHtml(r.station)}</td>
      <td data-label="Plan przyj.">${escapeHtml(r.planned_arr || "")}</td>
      <td data-label="Rzecz. przyj.">${escapeHtml(r.actual_arr || "")}</td>
      <td data-label="Odch. przyj.">${escapeHtml(formatDelayCell(delayArr))}</td>
      <td data-label="Plan odj.">${escapeHtml(r.planned_dep || "")}</td>
      <td data-label="Rzecz. odj.">${escapeHtml(r.actual_dep || "")}</td>
      <td data-label="Odch. odj.">${escapeHtml(formatDelayCell(delayDep))}</td>
      <td data-label="Powód">${escapeHtml(r.delay_reason || "")}</td>
      <td data-label="Rozkazy">${escapeHtml(r.orders || "")}</td>
      <td data-label="Akcje" class="action-group">
        <button class="btn small" data-role="edit" data-type="run" data-id="${r.id}">Edytuj</button>
        <button class="btn warning small" data-role="delete" data-type="run" data-id="${r.id}">Usuń</button>
      </td>`;
    if (repDelay !== null && Math.abs(repDelay) > 20) tr.classList.add("row-critical-delay");
    tbody.appendChild(tr);
  });
}

function renderDispos(report) {
  const list = qs("#dispo-list"); if (!list) return; list.innerHTML = "";
  (report?.dispos || []).forEach(d => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(d.source)}:</strong> ${escapeHtml(d.text)}
      <div style="margin-top:8px"><button class="btn small" data-role="edit" data-type="dispo" data-id="${d.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="dispo" data-id="${d.id}">Usuń</button></div>`;
    list.appendChild(li);
  });
}

function renderRemarks(report) {
  const list = qs("#remark-list"); if (!list) return; list.innerHTML = "";
  (report?.remarks || []).forEach(r => {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(r.text)}<div style="margin-top:8px"><button class="btn small" data-role="edit" data-type="remark" data-id="${r.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="remark" data-id="${r.id}">Usuń</button></div>`;
    list.appendChild(li);
  });
}

/* ---------- Modal system ---------- */
const modalBackdrop = qs("#modal-backdrop");
const modalTitle = qs("#modal-title");
const modalBody = qs("#modal-body");
const modalSaveBtn = qs("#modal-save-btn");
const modalCancelBtn = qs("#modal-cancel-btn");
const modalCloseBtn = qs("#modal-close");
let modalSaveHandler = null;
let lastFocusedElement = null;
function openModal(title, bodyHtml, onSave) {
  if (!modalBackdrop || !modalBody) return;
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalSaveHandler = onSave;
  modalBackdrop.classList.remove('hidden');
  modalBackdrop.setAttribute('aria-hidden','false');
  lastFocusedElement = document.activeElement;
  setTimeout(() => {
    const first = modalBody.querySelector('input,textarea,select,button,[tabindex]:not([tabindex="-1"])');
    if (first) { first.scrollIntoView({behavior:'smooth',block:'center'}); first.focus(); }
    else if (modalSaveBtn) modalSaveBtn.focus();
  }, 220);
  document.addEventListener('keydown', trapTabKey);
  document.addEventListener('keydown', escCloseModal);
}
function closeModal() {
  if (!modalBackdrop) return;
  modalBackdrop.classList.add('hidden');
  modalBackdrop.setAttribute('aria-hidden','true');
  modalSaveHandler = null;
  if (lastFocusedElement) lastFocusedElement.focus();
  document.removeEventListener('keydown', trapTabKey);
  document.removeEventListener('keydown', escCloseModal);
}
if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);
if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
if (modalSaveBtn) modalSaveBtn.addEventListener('click', () => { if (modalSaveHandler) modalSaveHandler(); });
if (modalBackdrop) modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
function escCloseModal(e) { if (e.key === "Escape") closeModal(); }
function trapTabKey(e) {
  if (e.key !== "Tab") return;
  const focusable = modalBackdrop.querySelectorAll("input,select,textarea,button,a,[tabindex]:not([tabindex='-1'])");
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
  else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
}

/* ---------- UI bindings ---------- */
function bindUiActions() {
  const safe = (sel, cb) => { const el = qs(sel); if (el) el.addEventListener('click', cb); };

  safe('#add-loco-btn', () => {
    openModal("Dodaj lokomotywę", `
      <label><span>Oznaczenie lokomotywy</span><input id="modal-loco-mark" type="text" /></label>
      <label><span>Stacja od</span><input id="modal-loco-from" type="text" /></label>
      <label><span>Stacja do</span><input id="modal-loco-to" type="text" /></label>
    `, async () => {
      const mark = qs("#modal-loco-mark").value.trim();
      const from = qs("#modal-loco-from").value.trim();
      const to = qs("#modal-loco-to").value.trim();
      if (!mark) { alert("Podaj oznaczenie lokomotywy."); return; }
      await addConsist(currentReportId, 'loco', mark, from, to);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      closeModal(); refreshLists();
    });
  });

  safe('#add-wagon-btn', () => {
    openModal("Dodaj wagon", `
      <label><span>Oznaczenie wagonu (max 5 znaków)</span><input id="modal-wagon-mark" maxlength="5" type="text" /></label>
      <label><span>Stacja od</span><input id="modal-wagon-from" type="text" /></label>
      <label><span>Stacja do</span><input id="modal-wagon-to" type="text" /></label>
    `, async () => {
      const mark = qs("#modal-wagon-mark").value.trim();
      const from = qs("#modal-wagon-from").value.trim();
      const to = qs("#modal-wagon-to").value.trim();
      if (!mark) { alert("Podaj oznaczenie wagonu."); return; }
      if (mark.length > 5) { alert("Oznaczenie wagonu max 5 znaków."); return; }
      await addConsist(currentReportId, 'wagon', mark, from, to);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      closeModal(); refreshLists();
    });
  });

  safe('#add-crew-btn', () => {
    openModal("Dodaj pracownika", `
      <label><span>Imię i nazwisko</span><input id="modal-crew-name" type="text" /></label>
      <label><span>Funkcja (M, KP, ZS, R)</span>
        <select id="modal-crew-role"><option value="">-- wybierz --</option><option value="M">M</option><option value="KP">KP</option><option value="ZS">ZS</option><option value="R">R</option></select>
      </label>
      <label><span>Stacja od</span><input id="modal-crew-from" type="text" /></label>
      <label><span>Stacja do</span><input id="modal-crew-to" type="text" /></label>
    `, async () => {
      const name = qs("#modal-crew-name").value.trim();
      const role = qs("#modal-crew-role").value;
      const from = qs("#modal-crew-from").value.trim();
      const to = qs("#modal-crew-to").value.trim();
      if (!name || !role) { alert("Podaj imię, nazwisko i funkcję."); return; }
      await addCrew(currentReportId, name, role, from, to);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      closeModal(); refreshLists();
    });
  });

  safe('#add-run-btn', () => {
    openModal("Dodaj wpis jazdy", `
      <label><span>Nazwa stacji</span>
        <div class="autocomplete">
          <input id="modal-run-station" type="text" autocomplete="off" placeholder="Wpisz lub wybierz stację" />
          <div class="autocomplete-list hidden" id="list-modal-run-station" role="listbox"></div>
        </div>
      </label>
      <label><span>Planowy przyjazd</span><input id="modal-run-planned-arr" type="datetime-local" /></label>
      <label><span>Rzeczywisty przyjazd</span><input id="modal-run-actual-arr" type="datetime-local" /></label>
      <label><span>Planowy odjazd</span><input id="modal-run-planned-dep" type="datetime-local" /></label>
      <label><span>Rzeczywisty odjazd</span><input id="modal-run-actual-dep" type="datetime-local" /></label>
      <label><span>Powód opóźnienia</span><input id="modal-run-delay-reason" type="text" /></label>
      <label><span>Otrzymane rozkazy</span><textarea id="modal-run-orders"></textarea></label>
    `, async () => {
      const station = qs("#modal-run-station").value.trim();
      const plannedArrRaw = qs("#modal-run-planned-arr").value;
      const actualArrRaw = qs("#modal-run-actual-arr").value;
      const plannedDepRaw = qs("#modal-run-planned-dep").value;
      const actualDepRaw = qs("#modal-run-actual-dep").value;
      const delayReason = qs("#modal-run-delay-reason").value.trim();
      const orders = qs("#modal-run-orders").value.trim();
      if (!station) { alert("Podaj nazwę stacji."); return; }

      // Konwersja datetime-local (bez strefy) do ISO (lokalnego)
      const toIso = (v) => v ? new Date(v).toISOString() : null;
      const plannedArr = toIso(plannedArrRaw);
      const actualArr = toIso(actualArrRaw);
      const plannedDep = toIso(plannedDepRaw);
      const actualDep = toIso(actualDepRaw);

      await addRun(currentReportId, station, plannedArr, actualArr, plannedDep, actualDep, delayReason, orders);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      closeModal(); refreshLists();
    });

    setTimeout(() => {
      const modalStationInput = qs('#modal-run-station');
      const modalStationList = qs('#list-modal-run-station');
      if (modalStationInput && modalStationList) {
        attachStationAutocomplete(modalStationInput, modalStationList);
        modalStationInput.dispatchEvent(new Event('input'));
      }
    }, 250);
  });

  safe('#add-dispo-btn', () => {
    openModal("Dodaj dyspozycję", `
      <label><span>Kto wydał dyspozycję</span>
        <select id="modal-dispo-source"><option value="">-- wybierz --</option><option value="Dyspozytura">Dyspozytura</option><option value="PLK">PLK</option><option value="Inny">Inny</option></select>
      </label>
      <label><span>Treść dyspozycji</span><textarea id="modal-dispo-text"></textarea></label>
    `, async () => {
      const source = qs("#modal-dispo-source").value;
      const text = qs("#modal-dispo-text").value.trim();
      if (!source || !text) { alert("Wybierz źródło i wpisz treść."); return; }
      await addDispo(currentReportId, source, text);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      closeModal(); refreshLists();
    });
  });

  safe('#add-remark-btn', () => {
    openModal("Dodaj uwagę", `<label><span>Treść uwagi</span><textarea id="modal-remark-text"></textarea></label>`, async () => {
      const text = qs("#modal-remark-text").value.trim();
      if (!text) { alert("Wpisz treść uwagi."); return; }
      await addRemark(currentReportId, text);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      closeModal(); refreshLists();
    });
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const role = btn.getAttribute("data-role");
    const action = btn.getAttribute("data-action");
    if (action) {
      const id = btn.getAttribute("data-id");
      if (action === "takeover") await takeOverReport(id);
      if (action === "preview") {
        const report = await getReportById(id);
        if (!report) { alert('Nie można pobrać raportu'); return; }
        loadReportIntoForm(report, true);
        const nav = qs('.nav-btn[data-panel="handle-train"]');
        if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); }
        showPanel("handle-train");
      }
      return;
    }
    if (!role) return;
    const type = btn.getAttribute("data-type");
    const id = btn.getAttribute("data-id");
    if (role === "delete") {
      if (!confirm("Na pewno usunąć?")) return;
      await deleteRow(type === 'consist' ? 'consist' : type, id);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      refreshLists();
    }
    if (role === "edit") {
      const table = (type === 'consist' ? 'consist' : type);
      const { data, error } = await sb.from(table).select('*').eq('id', id).single();
      if (error || !data) { alert('Błąd pobierania rekordu'); return; }

      if (type === 'run') {
        const stationVal = data.station || '';
        const plannedArrVal = data.planned_arr || '';
        const actualArrVal = data.actual_arr || '';
        const plannedDepVal = data.planned_dep || '';
        const actualDepVal = data.actual_dep || '';
        const delayReasonVal = data.delay_reason || '';
        const ordersVal = data.orders || '';

        openModal("Edytuj wpis jazdy", `
          <label><span>Nazwa stacji</span>
            <div class="autocomplete">
              <input id="modal-run-station" type="text" autocomplete="off" placeholder="Wpisz lub wybierz stację" value="${escapeAttr(stationVal)}" />
              <div class="autocomplete-list hidden" id="list-modal-run-station" role="listbox"></div>
            </div>
          </label>
          <label><span>Planowy przyjazd</span><input id="modal-run-planned-arr" type="datetime-local" value="${escapeAttr(plannedArrVal ? plannedArrVal.slice(0,16) : '')}" /></label>
          <label><span>Rzeczywisty przyjazd</span><input id="modal-run-actual-arr" type="datetime-local" value="${escapeAttr(actualArrVal ? actualArrVal.slice(0,16) : '')}" /></label>
          <label><span>Planowy odjazd</span><input id="modal-run-planned-dep" type="datetime-local" value="${escapeAttr(plannedDepVal ? plannedDepVal.slice(0,16) : '')}" /></label>
          <label><span>Rzeczywisty odjazd</span><input id="modal-run-actual-dep" type="datetime-local" value="${escapeAttr(actualDepVal ? actualDepVal.slice(0,16) : '')}" /></label>
          <label><span>Powód opóźnienia</span><input id="modal-run-delay-reason" type="text" value="${escapeAttr(delayReasonVal)}" /></label>
          <label><span>Otrzymane rozkazy</span><textarea id="modal-run-orders">${escapeAttr(ordersVal)}</textarea></label>
        `, async () => {
          const station = qs("#modal-run-station").value.trim();
          const plannedArrRaw = qs("#modal-run-planned-arr").value;
          const actualArrRaw = qs("#modal-run-actual-arr").value;
          const plannedDepRaw = qs("#modal-run-planned-dep").value;
          const actualDepRaw = qs("#modal-run-actual-dep").value;
          const delayReason = qs("#modal-run-delay-reason").value.trim();
          const orders = qs("#modal-run-orders").value.trim();
          if (!station) { alert("Podaj nazwę stacji."); return; }

          const toIso = (v) => v ? new Date(v).toISOString() : null;
          await updateRow('runs', id, {
            station,
            planned_arr: toIso(plannedArrRaw),
            actual_arr: toIso(actualArrRaw),
            planned_dep: toIso(plannedDepRaw),
            actual_dep: toIso(actualDepRaw),
            delay_reason: delayReason, orders
          });
          const report = await getReportById(currentReportId);
          loadReportIntoForm(report, false);
          closeModal(); refreshLists();
        });

        setTimeout(() => {
          const modalStationInput = qs('#modal-run-station');
          const modalStationList = qs('#list-modal-run-station');
          if (modalStationInput && modalStationList) {
            attachStationAutocomplete(modalStationInput, modalStationList);
            modalStationInput.dispatchEvent(new Event('input'));
          }
        }, 250);

      } else if (type === 'dispo') {
        openModal("Edytuj dyspozycję", `
          <label><span>Źródło</span><input id="modal-dispo-source" type="text" value="${escapeAttr(data.source)}" /></label>
          <label><span>Treść</span><textarea id="modal-dispo-text">${escapeAttr(data.text)}</textarea></label>
        `, async () => {
          const source = qs("#modal-dispo-source").value;
          const text = qs("#modal-dispo-text").value;
          await updateRow('dispos', id, { source, text });
          const report = await getReportById(currentReportId);
          loadReportIntoForm(report, false);
          closeModal(); refreshLists();
        });
      } else if (type === 'remark') {
        openModal("Edytuj uwagę", `<label><span>Treść</span><textarea id="modal-remark-text">${escapeAttr(data.text)}</textarea></label>`, async () => {
          const text = qs("#modal-remark-text").value;
          await updateRow('remarks', id, { text });
          const report = await getReportById(currentReportId);
          loadReportIntoForm(report, false);
          closeModal(); refreshLists();
        });
      } else {
        alert('Edycja tego typu rekordu dostępna w kolejnej wersji.');
      }
    }
  });

  const saveBtn = qs("#save-report-btn");
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    const r = await readReportFromForm();
    if (!currentReportId) {
      const created = await createEmptyReport();
      if (!created) { alert('Błąd tworzenia raportu'); return; }
      currentReportId = created.id;
    }
    await updateReportFields(currentReportId, { train_number: r.general.trainNumber, date: r.general.date || null, from_station: r.general.from, to_station: r.general.to });
    alert("Raport zapisany.");
    const report = await getReportById(currentReportId);
    loadReportIntoForm(report, false);
    refreshLists();
  });

  const generatePdfBtn = qs("#generate-pdf-btn");
  if (generatePdfBtn) generatePdfBtn.addEventListener("click", async () => {
    const report = await getReportById(currentReportId);
    if (!report) { alert("Brak danych do wydruku."); return; }
    openPrintWindow(report);
  });

  const finishBtn = qs("#finish-btn");
  if (finishBtn) finishBtn.addEventListener("click", async () => {
    if (!currentReportId) { alert('Brak aktywnego raportu'); return; }
    openConfirm("Zamknięcie obsługi spowoduje ostateczne zapisanie danych. Czy chcesz zamknąć?", async () => {
      await updateReportFields(currentReportId, { status: 'finished' });
      currentReportId = null;
      showPanel('menu');
      refreshLists();
    });
  });

  const handoverBtn = qs("#handover-btn");
  if (handoverBtn) handoverBtn.addEventListener("click", async () => {
    if (!currentReportId) { alert('Brak aktywnego raportu'); return; }
    await handoverReport(currentReportId);
    currentReportId = null;
    showPanel('menu');
    refreshLists();
  });

  const newReportBtn = qs("#new-report-btn");
  if (newReportBtn) newReportBtn.addEventListener("click", async () => {
    const r = await createEmptyReport();
    if (!r) { alert('Błąd tworzenia raportu'); return; }
    currentReportId = r.id;
    loadReportIntoForm(await getReportById(currentReportId), false);
    const nav = qs('.nav-btn[data-panel="handle-train"]');
    if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
    refreshLists();
  });

  // bottom-nav exists but is intentionally not shown; keep click wiring in case of future use
  const bottomNav = qs('.bottom-nav');
  if (bottomNav) {
    bottomNav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const panel = b.getAttribute('data-panel');
      const nav = qs(`.nav-btn[data-panel="${panel}"]`);
      if (nav) nav.click(); else showPanel(panel);
    }));
    // do not force show bottom-nav on mobile
  }
}

/* handover/takeover */
async function handoverReport(reportId) {
  if (!reportId || !sb) return;
  const { data, error } = await sb.from('reports').update({ status: 'handed_over' }).eq('id', reportId).select().single();
  if (error) { console.error('handover error', error); alert('Błąd przy przekazywaniu obsługi: ' + (error.message || JSON.stringify(error))); return; }
}
async function takeOverReport(reportId) {
  if (!reportId || !sb) return;
  const { data: userData } = await sb.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) { alert('Musisz być zalogowany, aby przejąć raport'); return; }
  const { data, error } = await sb.from('reports').update({ created_by: uid, status: 'in_progress' }).eq('id', reportId).select().single();
  if (error) { console.error('takeover error', error); alert('Błąd przy przejmowaniu raportu: ' + (error.message || JSON.stringify(error))); return; }
  const report = await getReportById(reportId);
  loadReportIntoForm(report, false);
  refreshLists();
}

/* ---------- Safe refreshLists (zabezpieczenia przed null DOM) ---------- */

async function refreshLists() {
  const uid = await getCurrentUid();
  if (!uid || !sb) return;

  // helper: bezpiecznie pobiera tbody lub tworzy go jeśli brak
  function getOrCreateTbody(tableSelector) {
    const table = qs(tableSelector);
    if (!table) {
      console.warn('refreshLists: brak tabeli', tableSelector);
      return null;
    }
    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }
    return tbody;
  }

  try {
    // 1) Raporty przekazane do przejęcia (takeover)
    const { data: takeoverData, error: tErr } = await sb.from('reports').select('*').eq('status', 'handed_over').order('date', { ascending: false });
    if (tErr) console.error('refreshLists takeover error', tErr);

    const takeoverTbody = getOrCreateTbody("#takeover-table");
    if (takeoverTbody) takeoverTbody.innerHTML = "";
    (takeoverData || []).forEach(r => {
      if (!takeoverTbody) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Numer">${escapeHtml(r.train_number || '')}</td>
        <td data-label="Relacja">${escapeHtml((r.from_station||'') + ' – ' + (r.to_station||''))}</td>
        <td data-label="Dzień">${escapeHtml(r.date || '')}</td>
        <td data-label="Akcja"><button class="btn small" data-action="takeover" data-id="${r.id}">Przejmij</button></td>`;
      takeoverTbody.appendChild(tr);
    });

    // 2) Podgląd raportów — wszystkie raporty
    const { data: allReports, error: aErr } = await sb.from('reports').select('*').order('date', { ascending: false });
    if (aErr) console.error('refreshLists allReports error', aErr);

    const checkTbody = getOrCreateTbody("#check-table");
    if (checkTbody) checkTbody.innerHTML = "";
    (allReports || []).forEach(r => {
      if (!checkTbody) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Numer">${escapeHtml(r.train_number || '')}</td>
        <td data-label="Relacja">${escapeHtml((r.from_station||'') + ' – ' + (r.to_station||''))}</td>
        <td data-label="Dzień">${escapeHtml(r.date || '')}</td>
        <td data-label="Status">${escapeHtml(r.status || '')}</td>
        <td data-label="Podgląd"><button class="btn small" data-action="preview" data-id="${r.id}">Podgląd</button></td>`;
      checkTbody.appendChild(tr);
    });

    // 3) DyspoPanel — aktywne raporty z obliczeniem opóźnienia
    const { data: activeReports, error: arErr } = await sb.from('reports').select('id,train_number,date,from_station,to_station').neq('status','finished').order('date', { ascending: false });
    if (arErr) console.error('refreshLists activeReports error', arErr);

    const dyspoTbody = getOrCreateTbody("#dyspo-table");
    if (dyspoTbody) dyspoTbody.innerHTML = "";

    for (const r of (activeReports || [])) {
      if (!dyspoTbody) break;

      // Pobierz ostatni wpis runs: preferuj ostatni actual, jeśli brak — ostatni planned
      let lr = null;
      try {
        const { data: runsActual, error: raErr } = await sb.from('runs').select('*').eq('report_id', r.id).not('actual_arr', 'is', null).order('actual_arr', { ascending: false }).limit(1);
        if (raErr) console.warn('runsActual error', raErr);
        if (runsActual && runsActual.length) lr = runsActual[0];
        else {
          const { data: runsPlanned, error: rpErr } = await sb.from('runs').select('*').eq('report_id', r.id).order('planned_arr', { ascending: false }).limit(1);
          if (rpErr) console.warn('runsPlanned error', rpErr);
          if (runsPlanned && runsPlanned.length) lr = runsPlanned[0];
        }
      } catch (e) {
        console.error('refreshLists lastRun fetch exception', e);
      }

      let delay = null;
      if (lr) {
        const delayArr = calculateDelayMinutes(lr.planned_arr, lr.actual_arr);
        const delayDep = calculateDelayMinutes(lr.planned_dep, lr.actual_dep);
        if (delayArr === null && delayDep === null) delay = null;
        else if (delayArr === null) delay = delayDep;
        else if (delayDep === null) delay = delayArr;
        else delay = Math.abs(delayArr) >= Math.abs(delayDep) ? delayArr : delayDep;
      }

      const tr = document.createElement("tr");
      if (delay !== null && Math.abs(delay) > 20) tr.classList.add("row-critical-delay");
      tr.innerHTML = `
        <td data-label="Numer">${escapeHtml(r.train_number || '')}</td>
        <td data-label="Relacja">${escapeHtml((r.from_station||'') + ' – ' + (r.to_station||''))}</td>
        <td data-label="Ostatnia stacja">${escapeHtml(lr ? lr.station : '-')}</td>
        <td data-label="Odchylenie">${delay === null ? '' : (delay>0?('+'+delay):String(delay))}</td>`;
      dyspoTbody.appendChild(tr);
    }
  } catch (e) {
    console.error('refreshLists outer error', e);
  }
}

/* read/load form */
async function readReportFromForm() {
  const train = qs("#general-train-number")?.value.trim() || "";
  const date = qs("#general-date")?.value || null;
  const from = qs("#general-from")?.value.trim() || "";
  const to = qs("#general-to")?.value.trim() || "";
  return { general: { trainNumber: train, date, from, to } };
}

function loadReportIntoForm(report, isReadOnly) {
  if (!report) return;
  currentReportId = report.id;
  readOnlyMode = !!isReadOnly;

  const elTrain = qs("#general-train-number");
  if (elTrain && document.activeElement !== elTrain) elTrain.value = report.general.trainNumber || "";

  const elDate = qs("#general-date");
  if (elDate && document.activeElement !== elDate) elDate.value = report.general.date || "";

  const elFrom = qs("#general-from");
  if (elFrom && document.activeElement !== elFrom) {
    elFrom.value = report.general.from || "";
    if (report.from_code) elFrom.dataset.stationCode = report.from_code;
    else if (!report.from_code) delete elFrom.dataset.stationCode;
  }

  const elTo = qs("#general-to");
  if (elTo && document.activeElement !== elTo) {
    elTo.value = report.general.to || "";
    if (report.to_code) elTo.dataset.stationCode = report.to_code;
    else if (!report.to_code) delete elTo.dataset.stationCode;
  }

  renderConsist(report);
  renderCrew(report);
  renderRuns(report);
  renderDispos(report);
  renderRemarks(report);
  updateStatusLabel(report);

  const disabled = readOnlyMode || report.status === "finished";
  ["#add-loco-btn","#add-wagon-btn","#add-crew-btn","#add-run-btn","#add-dispo-btn","#add-remark-btn","#finish-btn","#handover-btn","#save-report-btn"].forEach(id => { const el = qs(id); if (el) el.disabled = disabled; });
  ["#general-train-number","#general-date","#general-from","#general-to"].forEach(id => { const el = qs(id); if (el) el.disabled = disabled; });
}

/* autosave */
let autosaveTimer;
function bindAutosave() {
  ["#general-train-number","#general-date","#general-from","#general-to"].forEach(sel => {
    const el = qs(sel); if (!el) return;
    el.addEventListener("input", () => {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(async () => {
        if (readOnlyMode) return;
        if (!currentReportId) {
          const created = await createEmptyReport();
          if (!created) return;
          currentReportId = created.id;
        }
        const r = await readReportFromForm();
        await updateReportFields(currentReportId, {
          train_number: r.general.trainNumber,
          date: r.general.date || null,
          from_station: r.general.from,
          to_station: r.general.to
        });

        try {
          const report = await getReportById(currentReportId);
          if (report) {
            if (document.activeElement !== qs("#general-train-number")) qs("#general-train-number").value = report.general.trainNumber || "";
            if (document.activeElement !== qs("#general-date")) qs("#general-date").value = report.general.date || "";
            if (document.activeElement !== qs("#general-from")) {
              qs("#general-from").value = report.general.from || "";
              if (report.from_code) qs("#general-from").dataset.stationCode = report.from_code;
              else delete qs("#general-from").dataset.stationCode;
            }
            if (document.activeElement !== qs("#general-to")) {
              qs("#general-to").value = report.general.to || "";
              if (report.to_code) qs("#general-to").dataset.stationCode = report.to_code;
              else delete qs("#general-to").dataset.stationCode;
            }
            renderConsist(report); renderCrew(report); renderRuns(report); renderDispos(report); renderRemarks(report);
            updateStatusLabel(report);
          }
          refreshLists();
        } catch (e) {
          console.warn('Autosave post-update refresh error', e);
        }
      }, 700);
    });
  });
}

/* confirm modal */
const confirmBackdrop = qs("#confirm-backdrop");
const confirmMessage = qs("#confirm-message");
const confirmOkBtn = qs("#confirm-ok-btn");
const confirmCancelBtn = qs("#confirm-cancel-btn");
let confirmHandler = null;
function openConfirm(message, onOk) {
  if (!confirmBackdrop) return;
  confirmMessage.textContent = message;
  confirmHandler = onOk;
  confirmBackdrop.classList.remove("hidden");
  confirmBackdrop.setAttribute("aria-hidden","false");
  confirmCancelBtn && confirmCancelBtn.focus();
}
function closeConfirm() {
  if (!confirmBackdrop) return;
  confirmBackdrop.classList.add("hidden");
  confirmBackdrop.setAttribute("aria-hidden","true");
  confirmHandler = null;
}
if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", closeConfirm);
if (confirmOkBtn) confirmOkBtn.addEventListener("click", () => { if (confirmHandler) confirmHandler(); closeConfirm(); });

/* print */
function openPrintWindow(report) {
  const win = window.open("", "_blank", "noopener");
  if (!win) { alert("Przeglądarka zablokowała otwieranie nowego okna. Zezwól na wyskakujące okna i spróbuj ponownie."); return; }
  const css = `body{font-family:Inter,Arial,Helvetica,sans-serif;color:#0b1220;margin:20px}h1{font-size:20px;margin-bottom:6px}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Raport ${escapeHtml(report.general.trainNumber||'')}</title><style>${css}</style></head><body><h1>Raport — ${escapeHtml(report.general.trainNumber||'')}</h1><div>Data: ${escapeHtml(report.general.date||'')}</div></body></html>`;
  win.document.open(); win.document.write(html); win.document.close();
}

/* ---------- DyspoPanel auto-refresh (co 3 minuty) ---------- */

let dyspoRefreshIntervalMs = 3 * 60 * 1000; // 3 minuty
let dyspoRefreshTimer = null;
let isRefreshingDyspo = false;

function ensureDyspoUiElements() {
  const panel = document.getElementById('panel-dyspo');
  if (!panel) return;

  if (!document.getElementById('dyspo-last-updated')) {
    const header = panel.querySelector('.panel-header');
    if (header) {
      const info = document.createElement('div');
      info.id = 'dyspo-last-updated';
      info.className = 'muted';
      info.style.marginLeft = '12px';
      info.style.fontSize = '13px';
      header.appendChild(info);
    }
  }

  const refreshBtnId = 'dyspo-manual-refresh';
  if (!document.getElementById(refreshBtnId)) {
    const header = panel.querySelector('.panel-header .panel-actions');
    if (header) {
      const btn = document.createElement('button');
      btn.id = refreshBtnId;
      btn.className = 'btn small';
      btn.textContent = 'Odśwież teraz';
      btn.addEventListener('click', () => {
        triggerDyspoRefresh(true);
      });
      header.appendChild(btn);
    }
  }
}

function setDyspoLastUpdated(ts = null) {
  const el = document.getElementById('dyspo-last-updated');
  if (!el) return;
  if (!ts) {
    el.textContent = '';
    return;
  }
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  el.textContent = `Ostatnie odświeżenie: ${hh}:${mm}:${ss}`;
}

async function triggerDyspoRefresh(force = false) {
  if (isRefreshingDyspo && !force) return;
  isRefreshingDyspo = true;
  try {
    if (typeof refreshLists === 'function') {
      await refreshLists();
      setDyspoLastUpdated(Date.now());
    } else {
      console.warn('triggerDyspoRefresh: refreshLists() nieznane');
    }
  } catch (e) {
    console.error('triggerDyspoRefresh error', e);
  } finally {
    isRefreshingDyspo = false;
  }
}

function startDyspoAutoRefresh() {
  stopDyspoAutoRefresh();
  triggerDyspoRefresh();
  dyspoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    triggerDyspoRefresh();
  }, dyspoRefreshIntervalMs);
}

function stopDyspoAutoRefresh() {
  if (dyspoRefreshTimer) {
    clearInterval(dyspoRefreshTimer);
    dyspoRefreshTimer = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopDyspoAutoRefresh();
  } else {
    startDyspoAutoRefresh();
  }
});

function initDyspoAutoRefreshIntegration() {
  ensureDyspoUiElements();
  startDyspoAutoRefresh();
}

/* ---------- Init and helpers ---------- */
function bindInitialUi() {
  const navBtns = Array.from(document.querySelectorAll(".nav-btn"));
  navBtns.forEach(btn => btn.addEventListener("click", () => {
    navBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const panel = btn.getAttribute("data-panel");
    showPanel(panel);
    const sidebarEl = qs("#sidebar");
    if (sidebarEl) sidebarEl.classList.remove("open");
  }));

  Array.from(document.querySelectorAll("[data-open]")).forEach(b => b.addEventListener("click", () => {
    const panel = b.getAttribute("data-open");
    const nav = document.querySelector(`.nav-btn[data-panel="${panel}"]`);
    if (nav) nav.click(); else showPanel(panel);
  }));

  const sidebar = qs("#sidebar");
  const sidebarToggle = qs("#sidebar-toggle");
  const sidebarBackdrop = qs("#sidebar-backdrop");

  // Sidebar/hamburger handling (robust)
  if (sidebarToggle && sidebar && sidebarBackdrop) {
    sidebarToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('visible');
        sidebarBackdrop.classList.add('hidden');
        sidebarToggle.setAttribute('aria-expanded', 'false');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      } else {
        sidebar.classList.add('open');
        sidebarBackdrop.classList.remove('hidden');
        sidebarBackdrop.classList.add('visible');
        sidebarToggle.setAttribute('aria-expanded', 'true');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
      }
    });

    sidebarBackdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('visible');
      sidebarBackdrop.classList.add('hidden');
      sidebarToggle.setAttribute('aria-expanded', 'false');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    });

    // Close sidebar when a nav button inside it is clicked
    sidebar.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn, [data-open]');
      if (!btn) return;
      setTimeout(() => {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('visible');
        sidebarBackdrop.classList.add('hidden');
        sidebarToggle.setAttribute('aria-expanded', 'false');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }, 120);
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('visible');
        sidebarBackdrop.classList.add('hidden');
        sidebarToggle.setAttribute('aria-expanded', 'false');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    });

    // Ensure sidebar state on resize
    window.addEventListener('resize', () => {
      if (window.matchMedia && window.matchMedia('(min-width:901px)').matches) {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('visible');
        sidebarBackdrop.classList.add('hidden');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        sidebarToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const logoutBtn = qs("#logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try { if (sb) await sb.auth.signOut(); } catch(e) { console.warn(e); }
      sessionStorage.removeItem('eRJ_user');
      window.location.href = 'login.html';
    });
  }
}

async function initApp() {
  const ok = await ensureAuthenticatedOrRedirect();
  if (!ok) return;

  await initStations();
  const fromInput = qs('#general-from');
  const toInput = qs('#general-to');
  const fromList = qs('#list-general-from');
  const toList = qs('#list-general-to');
  if (fromInput && fromList) attachStationAutocomplete(fromInput, fromList);
  if (toInput && toList) attachStationAutocomplete(toInput, toList);

  bindUiActions();
  bindAutosave();
  bindInitialUi();

  showPanel('menu');

  try {
    const reports = await loadReports();
    if (reports && reports.length) {
      const inProg = reports.find(r => r.status === 'in_progress');
      const toLoad = inProg || reports[0];
      if (toLoad) { const full = await getReportById(toLoad.id); loadReportIntoForm(full, false); }
    }
    refreshLists();
  } catch (e) { console.error('initApp load error', e); }

  setTimeout(() => {
    try { initDyspoAutoRefreshIntegration(); } catch(e){ console.error('initDyspoAutoRefreshIntegration error', e); }
  }, 800);
}

function showPanel(name) {
  qsa(".panel").forEach(p => p.hidden = true);
  const el = qs(`#panel-${name}`);
  if (el) el.hidden = false;
  if (name === "takeover" || name === "check" || name === "dyspo") refreshLists();
}

/* Service worker update handling (dodatkowe zabezpieczenie) */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service worker controller changed — reload');
    window.location.reload();
  });
}

/* Start */
document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(e => console.error('initApp error', e));
});
