/* app.js
   eRegioJet demo — front z Supabase (anon key)
   - wymaga zalogowania (sessionStorage lub Supabase Auth)
   - CRUD raportów i powiązanych tabel przez Supabase JS
   - modale, focus trap, dedykowany wydruk
*/

let currentReportId = null;
let readOnlyMode = false;
const supabase = window.supabase;

/* helpers */
const qs = (s, r = document) => (r || document).querySelector(s);
const qsa = (s, r = document) => Array.from((r || document).querySelectorAll(s));

/* auth check */
(function ensureLoggedIn() {
  const user = sessionStorage.getItem('eRJ_user');
  if (!user) {
    // jeśli nie ma sessionStorage, spróbuj Supabase auth
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data && data.user && data.user.id) {
        sessionStorage.setItem('eRJ_user', data.user.id);
        qs('#user-email-display').textContent = data.user.email || data.user.id;
      } else {
        window.location.href = 'index.html';
      }
    })();
    return;
  }
  qs('#user-email-display').textContent = user;
})();

/* sidebar toggle */
const sidebar = qs("#sidebar");
const sidebarToggle = qs("#sidebar-toggle");
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("open");
    sidebarToggle.setAttribute("aria-expanded", sidebar.classList.contains("open"));
  });
  document.addEventListener("click", (e) => {
    if (!sidebar.classList.contains("open")) return;
    if (e.target.closest("#sidebar") || e.target.closest("#sidebar-toggle")) return;
    sidebar.classList.remove("open");
    sidebarToggle.setAttribute("aria-expanded", "false");
  });
}

/* logout */
const logoutBtn = qs("#logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    // jeśli użyto Supabase Auth, wyloguj też z Supabase
    try { await supabase.auth.signOut(); } catch(e) {}
    sessionStorage.removeItem('eRJ_user');
    window.location.href = 'index.html';
  });
}

/* navigation */
qsa(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    qsa(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const panel = btn.getAttribute("data-panel");
    showPanel(panel);
    if (sidebar) sidebar.classList.remove("open");
  });
});
qsa("[data-open]").forEach(b => b.addEventListener("click", () => {
  const panel = b.getAttribute("data-open");
  const nav = qsa(`.nav-btn[data-panel="${panel}"]`)[0];
  if (nav) nav.click(); else showPanel(panel);
}));
function showPanel(name) {
  qsa(".panel").forEach(p => p.hidden = true);
  const el = qs(`#panel-${name}`);
  if (el) el.hidden = false;
  if (name === "takeover" || name === "check" || name === "dyspo") refreshLists();
}

/* Supabase CRUD helpers */
async function getCurrentUid() {
  const sessionUser = sessionStorage.getItem('eRJ_user');
  if (sessionUser) return sessionUser;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

async function loadReports() {
  const uid = await getCurrentUid();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('created_by', uid)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function getReportById(id) {
  const { data, error } = await supabase
    .from('reports')
    .select(`
      *,
      consist(*),
      crew(*),
      runs(*),
      dispos(*),
      remarks(*)
    `)
    .eq('id', id)
    .single();
  if (error) { console.error(error); return null; }
  return data;
}

async function createEmptyReport() {
  const uid = await getCurrentUid();
  const payload = {
    status: 'in_progress',
    train_number: '',
    date: null,
    from_station: '',
    to_station: '',
    created_by: uid
  };
  const { data, error } = await supabase.from('reports').insert([payload]).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

async function updateReportFields(id, fields) {
  const { data, error } = await supabase.from('reports').update(fields).eq('id', id).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

/* add related records */
async function addConsist(reportId, type, mark, from, to) {
  const { data, error } = await supabase.from('consist').insert([{ report_id: reportId, type, mark, from_station: from, to_station: to }]);
  if (error) console.error(error);
  return data;
}
async function addCrew(reportId, name, role, from, to) {
  const { data, error } = await supabase.from('crew').insert([{ report_id: reportId, name, role, from_station: from, to_station: to }]);
  if (error) console.error(error);
  return data;
}
async function addRun(reportId, station, plannedArr, actualArr, plannedDep, actualDep, delayReason, orders) {
  const { data, error } = await supabase.from('runs').insert([{
    report_id: reportId, station, planned_arr: plannedArr || null, actual_arr: actualArr || null,
    planned_dep: plannedDep || null, actual_dep: actualDep || null, delay_reason: delayReason, orders
  }]);
  if (error) console.error(error);
  return data;
}
async function addDispo(reportId, source, text) {
  const { data, error } = await supabase.from('dispos').insert([{ report_id: reportId, source, text }]);
  if (error) console.error(error);
  return data;
}
async function addRemark(reportId, text) {
  const { data, error } = await supabase.from('remarks').insert([{ report_id: reportId, text }]);
  if (error) console.error(error);
  return data;
}

/* delete / update helpers for related records */
async function deleteRow(table, id) {
  const { data, error } = await supabase.from(table).delete().eq('id', id);
  if (error) console.error(error);
  return data;
}
async function updateRow(table, id, fields) {
  const { data, error } = await supabase.from(table).update(fields).eq('id', id);
  if (error) console.error(error);
  return data;
}

/* render helpers */
function escapeHtml(s){ if (s === 0) return "0"; if (!s) return ""; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

function updateStatusLabel(report) {
  const label = qs("#report-status-label");
  if (!label) return;
  if (!report) { label.textContent = ""; return; }
  if (report.status === "finished") label.textContent = "Status: Zakończona (tylko do odczytu)";
  else if (report.status === "handed_over") label.textContent = "Status: Przekazana do przejęcia";
  else label.textContent = "Status: W trakcie prowadzenia";
}

/* render functions for consist/crew/runs/dispos/remarks */
function renderConsist(report) {
  const locoTbody = qs("#loco-table tbody"); const wagonTbody = qs("#wagon-table tbody");
  if (locoTbody) locoTbody.innerHTML = "";
  if (wagonTbody) wagonTbody.innerHTML = "";
  (report.consist || []).forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(l.mark)}</td><td>${escapeHtml(l.from_station)}</td><td>${escapeHtml(l.to_station)}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="consist" data-id="${l.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="consist" data-id="${l.id}">Usuń</button></td>`;
    if (l.type === 'loco') locoTbody.appendChild(tr); else wagonTbody.appendChild(tr);
  });
}

function renderCrew(report) {
  const tbody = qs("#crew-table tbody"); if (!tbody) return; tbody.innerHTML = "";
  (report.crew || []).forEach(c => {
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
  (report.runs || []).forEach(r => {
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
  (report.dispos || []).forEach(d => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(d.source)}:</strong> ${escapeHtml(d.text)}
      <div style="margin-top:8px"><button class="btn small" data-role="edit" data-type="dispo" data-id="${d.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="dispo" data-id="${d.id}">Usuń</button></div>`;
    list.appendChild(li);
  });
}

function renderRemarks(report) {
  const list = qs("#remark-list"); if (!list) return; list.innerHTML = "";
  (report.remarks || []).forEach(r => {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(r.text)}<div style="margin-top:8px"><button class="btn small" data-role="edit" data-type="remark" data-id="${r.id}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="remark" data-id="${r.id}">Usuń</button></div>`;
    list.appendChild(li);
  });
}

/* modal system (jak wcześniej) */
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
    const focusable = modalBody.querySelectorAll("input,select,textarea,button,a,[tabindex]:not([tabindex='-1'])");
    if (focusable.length) focusable[0].focus();
    else if (modalSaveBtn) modalSaveBtn.focus();
  }, 40);
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
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
  else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
}

/* add / edit actions (modale) */
const safeAddListener = (selector, handler) => { const el = qs(selector); if (el) el.addEventListener("click", handler); };

safeAddListener("#add-loco-btn", () => {
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

safeAddListener("#add-wagon-btn", () => {
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

safeAddListener("#add-crew-btn", () => {
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

safeAddListener("#add-run-btn", () => {
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

safeAddListener("#add-dispo-btn", () => {
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

safeAddListener("#add-remark-btn", () => {
  openModal("Dodaj uwagę", `<label><span>Treść uwagi</span><textarea id="modal-remark-text"></textarea></label>`, async () => {
    const text = qs("#modal-remark-text").value.trim();
    if (!text) { alert("Wpisz treść uwagi."); return; }
    await addRemark(currentReportId, text);
    const report = await getReportById(currentReportId);
    loadReportIntoForm(report, false);
    closeModal(); refreshLists();
  });
});

/* delegation for edit/delete of related rows */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const role = btn.getAttribute("data-role");
  const action = btn.getAttribute("data-action");
  if (action) return;
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
    // fetch row and open modal to edit (simplified: fetch single row)
    const { data, error } = await supabase.from(type === 'consist' ? 'consist' : type).select('*').eq('id', id).single();
    if (error || !data) { alert('Błąd pobierania rekordu'); return; }
    // build modal based on type (omitted full code for brevity) - implement similar to add modals
    // For demo: allow editing only text fields for dispos/remarks, or full edit for runs/consist/crew
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
      alert('Edycja tego typu rekordu jest dostępna w kolejnej wersji demo.');
    }
  }
});

/* save / pdf / finish / handover */
const saveBtn = qs("#save-report-btn");
if (saveBtn) saveBtn.addEventListener("click", async () => {
  const r = await readReportFromForm();
  if (!currentReportId) {
    const created = await createEmptyReport();
    currentReportId = created.id;
  }
  await updateReportFields(currentReportId, {
    train_number: r.general.trainNumber,
    date: r.general.date || null,
    from_station: r.general.from,
    to_station: r.general.to
  });
  alert("Raport zapisany (Supabase).");
  refreshLists();
});

const generatePdfBtn = qs("#generate-pdf-btn");
if (generatePdfBtn) generatePdfBtn.addEventListener("click", async () => {
  const report = await getReportById(currentReportId);
  if (!report) { alert("Brak danych do wydruku."); return; }
  openPrintWindow(report);
});

if (qs("#finish-btn")) qs("#finish-btn").addEventListener("click", async () => {
  const report = await readReportFromForm();
  if (!currentReportId) { alert('Brak aktywnego raportu'); return; }
  openConfirm("Zamknięcie obsługi spowoduje ostateczne zapisanie danych. Czy chcesz zamknąć?", async () => {
    await updateReportFields(currentReportId, { status: 'finished' });
    const r = await getReportById(currentReportId);
    loadReportIntoForm(r, true);
    refreshLists();
  });
});

if (qs("#handover-btn")) qs("#handover-btn").addEventListener("click", async () => {
  const r = await readReportFromForm();
  if (!currentReportId) { alert('Brak aktywnego raportu'); return; }
  if (!r.general.trainNumber || !r.general.date) { alert("Podaj numer pociągu i dzień kursowania przed przekazaniem."); return; }
  await updateReportFields(currentReportId, { status: 'handed_over' });
  const report = await getReportById(currentReportId);
  loadReportIntoForm(report, false);
  refreshLists();
  alert("Pociąg przekazany do przejęcia.");
});

/* lists: takeover / check / dyspo */
async function refreshLists() {
  const uid = await getCurrentUid();
  if (!uid) return;
  // takeover: reports with status handed_over
  const { data: takeoverData } = await supabase.from('reports').select('*').eq('status', 'handed_over').order('date', { ascending: false });
  const takeoverTbody = qs("#takeover-table tbody"); if (takeoverTbody) takeoverTbody.innerHTML = "";
  (takeoverData || []).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.train_number)}</td><td>${escapeHtml(r.from_station)} – ${escapeHtml(r.to_station)}</td><td>${escapeHtml(r.date || '')}</td>
      <td><button class="btn small" data-action="takeover" data-id="${r.id}">Przejmij</button></td>`;
    takeoverTbody.appendChild(tr);
  });

  // check: today and yesterday
  const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
  const dateToStr = d => d.toISOString().slice(0,10);
  const { data: allReports } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
  const checkTbody = qs("#check-table tbody"); if (checkTbody) checkTbody.innerHTML = "";
  (allReports || []).forEach(r => {
    if (!r.date) return;
    if (r.date === dateToStr(today) || r.date === dateToStr(yesterday)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(r.train_number)}</td><td>${escapeHtml(r.from_station)} – ${escapeHtml(r.to_station)}</td><td>${escapeHtml(r.date)}</td>
        <td><button class="btn small" data-action="preview" data-id="${r.id}">Podgląd</button></td>`;
      checkTbody.appendChild(tr);
    }
  });

  // dyspo: active reports (not finished)
  const { data: activeReports } = await supabase.from('reports').select('id,train_number,date,from_station,to_station').neq('status','finished').order('date', { ascending: false });
  const dyspoTbody = qs("#dyspo-table tbody"); if (dyspoTbody) dyspoTbody.innerHTML = "";
  for (const r of (activeReports || [])) {
    const { data: lastRun } = await supabase.from('runs').select('*').eq('report_id', r.id).order('planned_arr', { ascending: false }).limit(1);
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
    tr.innerHTML = `<td>${escapeHtml(r.train_number)}</td><td>${escapeHtml(r.from_station)} – ${escapeHtml(r.to_station)}</td><td>${escapeHtml(lr ? lr.station : '-')}</td><td>${delay === null ? '' : (delay>0?('+'+delay):delay)}</td>`;
    dyspoTbody.appendChild(tr);
  }
}

/* takeover / preview actions */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  if (!action) return;
  const id = btn.getAttribute("data-id");
  const report = await getReportById(id);
  if (!report) { alert("Nie znaleziono raportu."); return; }
  if (action === "takeover") {
    await updateReportFields(id, { status: 'in_progress' });
    loadReportIntoForm(await getReportById(id), false);
    const nav = qsa('.nav-btn[data-panel="handle-train"]')[0];
    if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
    refreshLists();
  } else if (action === "preview") {
    loadReportIntoForm(report, true);
    const nav = qsa('.nav-btn[data-panel="handle-train"]')[0];
    if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
  }
});

/* new report */
const newReportBtn = qs("#new-report-btn");
if (newReportBtn) newReportBtn.addEventListener("click", async () => {
  const r = await createEmptyReport();
  if (!r) { alert('Błąd tworzenia raportu'); return; }
  currentReportId = r.id;
  loadReportIntoForm(await getReportById(currentReportId), false);
  const nav = qsa('.nav-btn[data-panel="handle-train"]')[0];
  if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
  refreshLists();
});

/* read form into object */
async function readReportFromForm() {
  const train = qs("#general-train-number")?.value.trim() || "";
  const date = qs("#general-date")?.value || null;
  const from = qs("#general-from")?.value.trim() || "";
  const to = qs("#general-to")?.value.trim() || "";
  return { general: { trainNumber: train, date, from, to } };
}

/* load report into form */
function loadReportIntoForm(report, isReadOnly) {
  if (!report) return;
  currentReportId = report.id;
  readOnlyMode = !!isReadOnly;
  qs("#general-train-number").value = report.train_number || "";
  qs("#general-date").value = report.date || "";
  qs("#general-from").value = report.from_station || "";
  qs("#general-to").value = report.to_station || "";
  renderConsist(report);
  renderCrew(report);
  renderRuns(report);
  renderDispos(report);
  renderRemarks(report);
  updateStatusLabel(report);
  const disabled = readOnlyMode || report.status === "finished";
  ["#add-loco-btn","#add-wagon-btn","#add-crew-btn","#add-run-btn","#add-dispo-btn","#add-remark-btn","#finish-btn","#handover-btn","#save-report-btn"].forEach(id => {
    const el = qs(id); if (el) el.disabled = disabled;
  });
  ["#general-train-number","#general-date","#general-from","#general-to"].forEach(id => {
    const el = qs(id); if (el) el.disabled = disabled;
  });
}

/* auto-save general fields */
["#general-train-number","#general-date","#general-from","#general-to"].forEach(sel => {
  const el = qs(sel); if (!el) return;
  el.addEventListener("change", async () => {
    if (readOnlyMode) return;
    if (!currentReportId) {
      const created = await createEmptyReport();
      currentReportId = created.id;
    }
    const r = await readReportFromForm();
    await updateReportFields(currentReportId, {
      train_number: r.general.trainNumber,
      date: r.general.date || null,
      from_station: r.general.from,
      to_station: r.general.to
    });
    refreshLists();
  });
});

/* initial load */
window.addEventListener("load", async () => {
  // jeśli istnieje aktywny raport w localStorage (stare demo), nie migruj automatycznie
  const reports = await loadReports();
  if (reports && reports.length) {
    // załaduj ostatni w trakcie lub pierwszy
    const inProg = reports.find(r => r.status === 'in_progress');
    const toLoad = inProg || reports[0];
    if (toLoad) {
      const full = await getReportById(toLoad.id);
      loadReportIntoForm(full, false);
    }
  }
  refreshLists();
});

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

/* print window (dedicated A4) */
function openPrintWindow(report) {
  const win = window.open("", "_blank", "noopener");
  if (!win) { alert("Przeglądarka zablokowała otwieranie nowego okna. Zezwól na wyskakujące okna i spróbuj ponownie."); return; }
  const css = `
    body{font-family:Inter,Arial,Helvetica,sans-serif;color:#0b1220;margin:20px}
    h1{font-size:20px;margin-bottom:6px}
    h2{font-size:16px;margin:10px 0}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th,td{border:1px solid #ddd;padding:8px;font-size:12px}
    th{background:#f4f6fb;text-align:left}
    .section{margin-bottom:18px}
    .small{font-size:12px;color:#666}
    @media print{@page{size:A4;margin:12mm}}
  `;
  const html = `
    <!doctype html><html><head><meta charset="utf-8"/><title>Raport ${escapeHtml(report.train_number||'')}</title><style>${css}</style></head><body>
    <h1>Raport z jazdy — ${escapeHtml(report.train_number||'')}</h1>
    <div class="small">Data: ${escapeHtml(report
