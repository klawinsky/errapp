/* app.js — kompletny, bezpieczny i responsywny skrypt aplikacji
   - wymaga: window.supabase zainicjalizowanego w app.html
   - wszystkie selektory są sprawdzane przed użyciem
   - skrypt ładowany z defer, inicjalizacja po DOMContentLoaded
*/

console.log('app.js loaded');

const sb = (typeof window !== 'undefined' && window.supabase) ? window.supabase : null;

const qs = (s, r = document) => (r || document).querySelector(s);
const qsa = (s, r = document) => Array.from((r || document).querySelectorAll(s));
function escapeHtml(s){ if (s === 0) return "0"; if (!s) return ""; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

let currentReportId = null;
let readOnlyMode = false;

/* ---------- Auth helpers ---------- */
async function getCurrentUid() {
  const s = sessionStorage.getItem('eRJ_user');
  if (s) return s;
  try { if (!sb) return null; const { data } = await sb.auth.getUser(); return data?.user?.id || null; } catch(e){ return null; }
}

/* ---------- DB mapping ---------- */
function mapDbReportToUi(r) {
  if (!r) return null;
  return {
    id: r.id, status: r.status, created_by: r.created_by, created_at: r.created_at,
    general: { trainNumber: r.train_number || '', date: r.date || '', from: r.from_station || '', to: r.to_station || '' },
    consist: r.consist || [], crew: r.crew || [], runs: r.runs || [], dispos: r.dispos || [], remarks: r.remarks || []
  };
}

/* ---------- Supabase CRUD ---------- */
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
  if (!id || !sb) { console.error('updateReportFields: missing id or sb'); return null; }
  const { data, error } = await sb.from('reports').update(fields).eq('id', id).select().single();
  if (error) { console.error('updateReportFields error', error); return null; }
  return mapDbReportToUi(data);
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
  const { data, error } = await sb.from('runs').insert([{ report_id: reportId, station, planned_arr: plannedArr || null, actual_arr: actualArr || null, planned_dep: plannedDep || null, actual_dep: actualDep || null, delay_reason: delayReason || '', orders: orders || '' }]).select();
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

/* ---------- Render helpers ---------- */
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
    tr.innerHTML = `<td>${escapeHtml(l.mark)}</td><td>${escapeHtml(l.from_station)}</td><td>${escapeHtml(l.to_station)}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="consist" data-id="${l.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="consist" data-id="${l.id}">Usuń</button></td>`;
    if (l.type === 'loco') locoTbody.appendChild(tr); else wagonTbody.appendChild(tr);
  });
}

function renderCrew(report) {
  const tbody = qs("#crew-table tbody"); if (!tbody) return; tbody.innerHTML = "";
  (report?.crew || []).forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.role)}</td><td>${escapeHtml(c.from_station)}</td><td>${escapeHtml(c.to_station)}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="crew" data-id="${c.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="crew" data-id="${c.id}">Usuń</button></td>`;
    tbody.appendChild(tr);
  });
}

function calculateDelayMinutes(planned, actual) {
  if (!planned || !actual) return null;
  const p = new Date(planned); const a = new Date(actual);
  if (isNaN(p.getTime()) || isNaN(a.getTime())) return null;
  return Math.round((a.getTime() - p.getTime()) / 60000);
}
function formatDelayCell(delay) {
  if (delay === null) return "";
  if (delay < 0) return `<span class="delay-early">${delay} min</span>`;
  if (delay > 0) return `<span class="delay-late">+${delay} min</span>`;
  return `<span class="delay-on-time">0 min</span>`;
}

function renderRuns(report) {
  const tbody = qs("#run-table tbody"); if (!tbody) return; tbody.innerHTML = "";
  (report?.runs || []).forEach(r => {
    const delayArr = calculateDelayMinutes(r.planned_arr, r.actual_arr);
    const delayDep = calculateDelayMinutes(r.planned_dep, r.actual_dep);
    const repDelay = (delayArr === null && delayDep === null) ? null : (delayArr === null ? delayDep : (delayDep === null ? delayArr : (Math.abs(delayArr) >= Math.abs(delayDep) ? delayArr : delayDep)));
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.station)}</td>
      <td>${escapeHtml(r.planned_arr || "")}</td><td>${escapeHtml(r.actual_arr || "")}</td><td>${formatDelayCell(delayArr)}</td>
      <td>${escapeHtml(r.planned_dep || "")}</td><td>${escapeHtml(r.actual_dep || "")}</td><td>${formatDelayCell(delayDep)}</td>
      <td>${escapeHtml(r.delay_reason || "")}</td><td>${escapeHtml(r.orders || "")}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="run" data-id="${r.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="run" data-id="${r.id}">Usuń</button></td>`;
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
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden","false");
  lastFocusedElement = document.activeElement;
  setTimeout(() => {
    const first = modalBody.querySelector('input,textarea,select,button,[tabindex]:not([tabindex="-1"])');
    if (first) { first.scrollIntoView({behavior:'smooth',block:'center'}); first.focus(); }
    else if (modalSaveBtn) modalSaveBtn.focus();
  }, 220);
  document.addEventListener("keydown", trapTabKey);
  document.addEventListener("keydown", escCloseModal);
}
function closeModal() {
  if (!modalBackdrop) return;
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden","true");
  modalSaveHandler = null;
  if (lastFocusedElement) lastFocusedElement.focus();
  document.removeEventListener("keydown", trapTabKey);
  document.removeEventListener("keydown", escCloseModal);
}
if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);
if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
if (modalSaveBtn) modalSaveBtn.addEventListener("click", () => { if (modalSaveHandler) modalSaveHandler(); });
if (modalBackdrop) modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });
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
      <label><span>Nazwa stacji</span><input id="modal-run-station" type="text" /></label>
      <label><span>Planowy przyjazd</span><input id="modal-run-planned-arr" type="datetime-local" /></label>
      <label><span>Rzeczywisty przyjazd</span><input id="modal-run-actual-arr" type="datetime-local" /></label>
      <label><span>Planowy odjazd</span><input id="modal-run-planned-dep" type="datetime-local" /></label>
      <label><span>Rzeczywisty odjazd</span><input id="modal-run-actual-dep" type="datetime-local" /></label>
      <label><span>Powód opóźnienia</span><input id="modal-run-delay-reason" type="text" /></label>
      <label><span>Otrzymane rozkazy</span><textarea id="modal-run-orders"></textarea></label>
    `, async () => {
      const station = qs("#modal-run-station").value.trim();
      const plannedArr = qs("#modal-run-planned-arr").value;
      const actualArr = qs("#modal-run-actual-arr").value;
      const plannedDep = qs("#modal-run-planned-dep").value;
      const actualDep = qs("#modal-run-actual-dep").value;
      const delayReason = qs("#modal-run-delay-reason").value.trim();
      const orders = qs("#modal-run-orders").value.trim();
      if (!station) { alert("Podaj nazwę stacji."); return; }
      await addRun(currentReportId, station, plannedArr, actualArr, plannedDep, actualDep, delayReason, orders);
      const report = await getReportById(currentReportId);
      loadReportIntoForm(report, false);
      closeModal(); refreshLists();
    });
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
        loadReportIntoForm(report, true);
        const nav = qs('.nav-btn[data-panel="handle-train"]');
        if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
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
      if (type === 'dispo') {
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
        alert('Edycja tego typu rekordu dostępna w kolejnej wersji demo.');
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
      const r = await getReportById(currentReportId);
      loadReportIntoForm(r, true);
      refreshLists();
    });
  });

  const handoverBtn = qs("#handover-btn");
  if (handoverBtn) handoverBtn.addEventListener("click", async () => {
    if (!currentReportId) { alert('Brak aktywnego raportu'); return; }
    await handoverReport(currentReportId);
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

  const bottomNav = qs('.bottom-nav');
  if (bottomNav) {
    bottomNav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const panel = b.getAttribute('data-panel');
      const nav = qs(`.nav-btn[data-panel="${panel}"]`);
      if (nav) nav.click(); else showPanel(panel);
    }));
    if (window.matchMedia && window.matchMedia('(max-width:900px)').matches) bottomNav.hidden = false;
  }
}

/* ---------- Handover / Takeover ---------- */
async function handoverReport(reportId) {
  if (!reportId || !sb) return;
  const { data, error } = await sb.from('reports').update({ status: 'handed_over' }).eq('id', reportId).select().single();
  if (error) { console.error('handover error', error); alert('Błąd przy przekazywaniu obsługi: ' + (error.message || JSON.stringify(error))); return; }
  const report = await getReportById(reportId);
  loadReportIntoForm(report, true);
  refreshLists();
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

/* ---------- Lists and refresh ---------- */
async function refreshLists() {
  const uid = await getCurrentUid();
  if (!uid || !sb) return;

  const { data: takeoverData, error: tErr } = await sb.from('reports').select('*').eq('status', 'handed_over').order('date', { ascending: false });
  if (tErr) console.error('refreshLists takeover error', tErr);
  const takeoverTbody = qs("#takeover-table tbody"); if (takeoverTbody) takeoverTbody.innerHTML = "";
  (takeoverData || []).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.train_number || '')}</td><td>${escapeHtml((r.from_station||'') + ' – ' + (r.to_station||''))}</td><td>${escapeHtml(r.date || '')}</td>
      <td><button class="btn small" data-action="takeover" data-id="${r.id}">Przejmij</button></td>`;
    takeoverTbody.appendChild(tr);
  });

  const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
  const dateToStr = d => d.toISOString().slice(0,10);
  const { data: allReports, error: aErr } = await sb.from('reports').select('*').order('created_at', { ascending: false });
  if (aErr) console.error('refreshLists allReports error', aErr);
  const checkTbody = qs("#check-table tbody"); if (checkTbody) checkTbody.innerHTML = "";
  (allReports || []).forEach(r => {
    if (!r.date) return;
    if (r.date === dateToStr(today) || r.date === dateToStr(yesterday)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(r.train_number || '')}</td><td>${escapeHtml((r.from_station||'') + ' – ' + (r.to_station||''))}</td><td>${escapeHtml(r.date)}</td>
        <td><button class="btn small" data-action="preview" data-id="${r.id}">Podgląd</button></td>`;
      checkTbody.appendChild(tr);
    }
  });

  const { data: activeReports, error: arErr } = await sb.from('reports').select('id,train_number,date,from_station,to_station').neq('status','finished').order('date', { ascending: false });
  if (arErr) console.error('refreshLists activeReports error', arErr);
  const dyspoTbody = qs("#dyspo-table tbody"); if (dyspoTbody) dyspoTbody.innerHTML = "";
  for (const r of (activeReports || [])) {
    const { data: lastRun } = await sb.from('runs').select('*').eq('report_id', r.id).order('planned_arr', { ascending: false }).limit(1);
    const lr = (lastRun && lastRun[0]) || null;
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
    tr.innerHTML = `<td>${escapeHtml(r.train_number || '')}</td><td>${escapeHtml((r.from_station||'') + ' – ' + (r.to_station||''))}</td><td>${escapeHtml(lr ? lr.station : '-')}</td><td>${delay === null ? '' : (delay>0?('+'+delay):delay)}</td>`;
    dyspoTbody.appendChild(tr);
  }
}

/* ---------- Read / Load report form ---------- */
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
  const elTrain = qs("#general-train-number"); if (elTrain) elTrain.value = report.general.trainNumber || "";
  const elDate = qs("#general-date"); if (elDate) elDate.value = report.general.date || "";
  const elFrom = qs("#general-from"); if (elFrom) elFrom.value = report.general.from || "";
  const elTo = qs("#general-to"); if (elTo) elTo.value = report.general.to || "";
  renderConsist(report); renderCrew(report); renderRuns(report); renderDispos(report); renderRemarks(report);
  updateStatusLabel(report);
  const disabled = readOnlyMode || report.status === "finished";
  ["#add-loco-btn","#add-wagon-btn","#add-crew-btn","#add-run-btn","#add-dispo-btn","#add-remark-btn","#finish-btn","#handover-btn","#save-report-btn"].forEach(id => { const el = qs(id); if (el) el.disabled = disabled; });
  ["#general-train-number","#general-date","#general-from","#general-to"].forEach(id => { const el = qs(id); if (el) el.disabled = disabled; });
}

/* autosave debounce */
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
        await updateReportFields(currentReportId, { train_number: r.general.trainNumber, date: r.general.date || null, from_station: r.general.from, to_station: r.general.to });
        const report = await getReportById(currentReportId);
        loadReportIntoForm(report, false);
        refreshLists();
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

/* init */
async function initApp() {
  try {
    const { data } = sb ? await sb.auth.getUser() : { data: null };
    if (data && data.user && data.user.email) { const el = qs('#user-email-display'); if (el) el.textContent = data.user.email; sessionStorage.setItem('eRJ_user', data.user.id); }
  } catch (e) { console.warn('auth init', e); }

  const navBtns = Array.from(document.querySelectorAll(".nav-btn"));
  navBtns.forEach(btn => btn.addEventListener("click", () => { navBtns.forEach(b => b.classList.remove("active")); btn.classList.add("active"); const panel = btn.getAttribute("data-panel"); showPanel(panel); const sidebarEl = qs("#sidebar"); if (sidebarEl) sidebarEl.classList.remove("open"); }));

  Array.from(document.querySelectorAll("[data-open]")).forEach(b => b.addEventListener("click", () => { const panel = b.getAttribute("data-open"); const nav = document.querySelector(`.nav-btn[data-panel="${panel}"]`); if (nav) nav.click(); else showPanel(panel); }));

  const sidebar = qs("#sidebar"); const sidebarToggle = qs("#sidebar-toggle");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", (e) => { e.stopPropagation(); sidebar.classList.toggle("open"); sidebarToggle.setAttribute("aria-expanded", sidebar.classList.contains("open")); });
    document.addEventListener("click", (e) => { if (!sidebar.classList.contains("open")) return; if (e.target.closest("#sidebar") || e.target.closest("#sidebar-toggle")) return; sidebar.classList.remove("open"); sidebarToggle.setAttribute("aria-expanded", "false"); });
  }

  const logoutBtn = qs("#logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", async () => { try { if (sb) await sb.auth.signOut(); } catch(e){} sessionStorage.removeItem('eRJ_user'); window.location.href = 'index.html'; });

  bindUiActions();
  bindAutosave();

  try {
    const reports = await loadReports();
    if (reports && reports.length) {
      const inProg = reports.find(r => r.status === 'in_progress');
      const toLoad = inProg || reports[0];
      if (toLoad) { const full = await getReportById(toLoad.id); loadReportIntoForm(full, false); }
    }
    refreshLists();
  } catch (e) { console.error('initApp load error', e); }
}

function showPanel(name) {
  qsa(".panel").forEach(p => p.hidden = true);
  const el = qs(`#panel-${name}`);
  if (el) el.hidden = false;
  if (name === "takeover" || name === "check" || name === "dyspo") refreshLists();
}

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(e => console.error('initApp error', e));
});
