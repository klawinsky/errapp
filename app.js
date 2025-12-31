/* app.js
   eRegioJet demo — logika aplikacji
   - wymaga zalogowania (sprawdzane przez sessionStorage)
   - nav działa (otwieranie zakładek)
   - hamburger działa
   - modale działają z focus trap i Esc
   - dane w localStorage (STORAGE_KEY)
*/

const STORAGE_KEY = "eRegioJet_demo_modern_v2";

let currentReportId = null;
let readOnlyMode = false;

/* ---------- helpers ---------- */
const qs = (s, r = document) => (r || document).querySelector(s);
const qsa = (s, r = document) => Array.from((r || document).querySelectorAll(s));

/* ---------- auth check ---------- */
(function ensureLoggedIn() {
  const user = sessionStorage.getItem('eRJ_user');
  if (!user) {
    // jeśli brak logowania, wróć do strony logowania
    window.location.href = 'index.html';
    return;
  }
  qs('#user-email-display').textContent = user;
})();

/* ---------- sidebar toggle (mobile) ---------- */
const sidebar = qs("#sidebar");
const sidebarToggle = qs("#sidebar-toggle");
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarToggle.setAttribute("aria-expanded", sidebar.classList.contains("open"));
});
document.addEventListener("click", (e) => {
  if (!sidebar.classList.contains("open")) return;
  if (e.target.closest("#sidebar") || e.target.closest("#sidebar-toggle")) return;
  sidebar.classList.remove("open");
});

/* ---------- logout ---------- */
qs("#logout-btn").addEventListener("click", () => {
  sessionStorage.removeItem('eRJ_user');
  window.location.href = 'index.html';
});

/* ---------- panel navigation ---------- */
qsa(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    qsa(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const panel = btn.getAttribute("data-panel");
    showPanel(panel);
    // close sidebar on mobile
    sidebar.classList.remove("open");
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

/* ---------- storage ---------- */
function loadReports() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { console.error(e); return []; }
}
function saveReports(reports) { localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)); }
function createEmptyReport() {
  return {
    id: Date.now().toString(),
    status: "in_progress",
    general: { trainNumber: "", date: "", from: "", to: "" },
    consist: { locos: [], wagons: [] },
    crew: [],
    runs: [],
    dispos: [],
    remarks: []
  };
}
function getReportById(id) { return loadReports().find(r => r.id === id) || null; }
function upsertReport(report) {
  const reports = loadReports();
  const idx = reports.findIndex(r => r.id === report.id);
  if (idx === -1) reports.push(report); else reports[idx] = report;
  saveReports(reports);
}

/* ---------- form read/write ---------- */
function readReportFromForm() {
  if (!currentReportId) currentReportId = Date.now().toString();
  let report = getReportById(currentReportId);
  if (!report) { report = createEmptyReport(); report.id = currentReportId; }
  report.general.trainNumber = qs("#general-train-number").value.trim();
  report.general.date = qs("#general-date").value;
  report.general.from = qs("#general-from").value.trim();
  report.general.to = qs("#general-to").value.trim();
  return report;
}

function loadReportIntoForm(report, isReadOnly) {
  if (!report) return;
  currentReportId = report.id;
  readOnlyMode = !!isReadOnly;

  qs("#general-train-number").value = report.general.trainNumber || "";
  qs("#general-date").value = report.general.date || "";
  qs("#general-from").value = report.general.from || "";
  qs("#general-to").value = report.general.to || "";

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

function updateStatusLabel(report) {
  const label = qs("#report-status-label");
  if (!report) { label.textContent = ""; return; }
  if (report.status === "finished") label.textContent = "Status: Zakończona (tylko do odczytu)";
  else if (report.status === "handed_over") label.textContent = "Status: Przekazana do przejęcia";
  else label.textContent = "Status: W trakcie prowadzenia";
}

/* auto-save general fields */
["#general-train-number","#general-date","#general-from","#general-to"].forEach(sel => {
  const el = qs(sel); if (!el) return;
  el.addEventListener("change", () => {
    if (readOnlyMode) return;
    const r = readReportFromForm();
    upsertReport(r);
    refreshLists();
  });
});

/* ---------- render helpers ---------- */
function renderConsist(report) {
  const locoTbody = qs("#loco-table tbody"); const wagonTbody = qs("#wagon-table tbody");
  locoTbody.innerHTML = ""; wagonTbody.innerHTML = "";
  report.consist.locos.forEach((l, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(l.mark)}</td><td>${escapeHtml(l.from)}</td><td>${escapeHtml(l.to)}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="loco" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="loco" data-index="${i}">Usuń</button></td>`;
    locoTbody.appendChild(tr);
  });
  report.consist.wagons.forEach((w, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(w.mark)}</td><td>${escapeHtml(w.from)}</td><td>${escapeHtml(w.to)}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="wagon" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="wagon" data-index="${i}">Usuń</button></td>`;
    wagonTbody.appendChild(tr);
  });
}

function renderCrew(report) {
  const tbody = qs("#crew-table tbody"); tbody.innerHTML = "";
  report.crew.forEach((c,i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.role)}</td><td>${escapeHtml(c.from)}</td><td>${escapeHtml(c.to)}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="crew" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="crew" data-index="${i}">Usuń</button></td>`;
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
  const tbody = qs("#run-table tbody"); tbody.innerHTML = "";
  report.runs.forEach((r,i) => {
    const delayArr = calculateDelayMinutes(r.plannedArr, r.actualArr);
    const delayDep = calculateDelayMinutes(r.plannedDep, r.actualDep);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.station)}</td>
      <td>${escapeHtml(r.plannedArr || "")}</td><td>${escapeHtml(r.actualArr || "")}</td><td>${formatDelayCell(delayArr)}</td>
      <td>${escapeHtml(r.plannedDep || "")}</td><td>${escapeHtml(r.actualDep || "")}</td><td>${formatDelayCell(delayDep)}</td>
      <td>${escapeHtml(r.delayReason || "")}</td><td>${escapeHtml(r.orders || "")}</td>
      <td class="action-group"><button class="btn small" data-role="edit" data-type="run" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="run" data-index="${i}">Usuń</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderDispos(report) {
  const list = qs("#dispo-list"); list.innerHTML = "";
  report.dispos.forEach((d,i) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(d.source)}:</strong> ${escapeHtml(d.text)}
      <div style="margin-top:8px"><button class="btn small" data-role="edit" data-type="dispo" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="dispo" data-index="${i}">Usuń</button></div>`;
    list.appendChild(li);
  });
}

function renderRemarks(report) {
  const list = qs("#remark-list"); list.innerHTML = "";
  report.remarks.forEach((r,i) => {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(r.text)}<div style="margin-top:8px"><button class="btn small" data-role="edit" data-type="remark" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="remark" data-index="${i}">Usuń</button></div>`;
    list.appendChild(li);
  });
}

/* ---------- modal system with focus trap ---------- */
const modalBackdrop = qs("#modal-backdrop");
const modalTitle = qs("#modal-title");
const modalBody = qs("#modal-body");
const modalSaveBtn = qs("#modal-save-btn");
const modalCancelBtn = qs("#modal-cancel-btn");
const modalCloseBtn = qs("#modal-close");
let modalSaveHandler = null;
let lastFocusedElement = null;

function openModal(title, bodyHtml, onSave) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalSaveHandler = onSave;
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden","false");
  lastFocusedElement = document.activeElement;
  setTimeout(() => {
    const focusable = modalBody.querySelectorAll("input,select,textarea,button,a,[tabindex]:not([tabindex='-1'])");
    if (focusable.length) focusable[0].focus();
    else modalSaveBtn.focus();
  }, 40);
  document.addEventListener("keydown", trapTabKey);
  document.addEventListener("keydown", escCloseModal);
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden","true");
  modalSaveHandler = null;
  if (lastFocusedElement) lastFocusedElement.focus();
  document.removeEventListener("keydown", trapTabKey);
  document.removeEventListener("keydown", escCloseModal);
}

modalCancelBtn.addEventListener("click", closeModal);
modalCloseBtn.addEventListener("click", closeModal);
modalSaveBtn.addEventListener("click", () => { if (modalSaveHandler) modalSaveHandler(); });
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });

function escCloseModal(e) { if (e.key === "Escape") closeModal(); }
function trapTabKey(e) {
  if (e.key !== "Tab") return;
  const focusable = modalBackdrop.querySelectorAll("input,select,textarea,button,a,[tabindex]:not([tabindex='-1'])");
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* ---------- add / edit actions (modale) ---------- */
qs("#add-loco-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal("Dodaj lokomotywę", `
    <label><span>Oznaczenie lokomotywy</span><input id="modal-loco-mark" type="text" /></label>
    <label><span>Stacja od</span><input id="modal-loco-from" type="text" /></label>
    <label><span>Stacja do</span><input id="modal-loco-to" type="text" /></label>
  `, () => {
    const mark = qs("#modal-loco-mark").value.trim();
    const from = qs("#modal-loco-from").value.trim();
    const to = qs("#modal-loco-to").value.trim();
    if (!mark) { alert("Podaj oznaczenie lokomotywy."); return; }
    report.consist.locos.push({ mark, from, to });
    upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
  });
});

qs("#add-wagon-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal("Dodaj wagon", `
    <label><span>Oznaczenie wagonu (max 5 znaków)</span><input id="modal-wagon-mark" maxlength="5" type="text" /></label>
    <label><span>Stacja od</span><input id="modal-wagon-from" type="text" /></label>
    <label><span>Stacja do</span><input id="modal-wagon-to" type="text" /></label>
  `, () => {
    const mark = qs("#modal-wagon-mark").value.trim();
    const from = qs("#modal-wagon-from").value.trim();
    const to = qs("#modal-wagon-to").value.trim();
    if (!mark) { alert("Podaj oznaczenie wagonu."); return; }
    if (mark.length > 5) { alert("Oznaczenie wagonu max 5 znaków."); return; }
    report.consist.wagons.push({ mark, from, to });
    upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
  });
});

qs("#add-crew-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal("Dodaj pracownika", `
    <label><span>Imię i nazwisko</span><input id="modal-crew-name" type="text" /></label>
    <label><span>Funkcja (M, KP, ZS, R)</span>
      <select id="modal-crew-role"><option value="">-- wybierz --</option><option value="M">M</option><option value="KP">KP</option><option value="ZS">ZS</option><option value="R">R</option></select>
    </label>
    <label><span>Stacja od</span><input id="modal-crew-from" type="text" /></label>
    <label><span>Stacja do</span><input id="modal-crew-to" type="text" /></label>
  `, () => {
    const name = qs("#modal-crew-name").value.trim();
    const role = qs("#modal-crew-role").value;
    const from = qs("#modal-crew-from").value.trim();
    const to = qs("#modal-crew-to").value.trim();
    if (!name || !role) { alert("Podaj imię, nazwisko i funkcję."); return; }
    report.crew.push({ name, role, from, to });
    upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
  });
});

qs("#add-run-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal("Dodaj wpis jazdy", `
    <label><span>Nazwa stacji</span><input id="modal-run-station" type="text" /></label>
    <label><span>Planowy przyjazd</span><input id="modal-run-planned-arr" type="datetime-local" /></label>
    <label><span>Rzeczywisty przyjazd</span><input id="modal-run-actual-arr" type="datetime-local" /></label>
    <label><span>Planowy odjazd</span><input id="modal-run-planned-dep" type="datetime-local" /></label>
    <label><span>Rzeczywisty odjazd</span><input id="modal-run-actual-dep" type="datetime-local" /></label>
    <label><span>Powód opóźnienia</span><input id="modal-run-delay-reason" type="text" /></label>
    <label><span>Otrzymane rozkazy</span><textarea id="modal-run-orders"></textarea></label>
  `, () => {
    const station = qs("#modal-run-station").value.trim();
    const plannedArr = qs("#modal-run-planned-arr").value;
    const actualArr = qs("#modal-run-actual-arr").value;
    const plannedDep = qs("#modal-run-planned-dep").value;
    const actualDep = qs("#modal-run-actual-dep").value;
    const delayReason = qs("#modal-run-delay-reason").value.trim();
    const orders = qs("#modal-run-orders").value.trim();
    if (!station) { alert("Podaj nazwę stacji."); return; }
    report.runs.push({ station, plannedArr, actualArr, plannedDep, actualDep, delayReason, orders });
    upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
  });
});

qs("#add-dispo-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal("Dodaj dyspozycję", `
    <label><span>Kto wydał dyspozycję</span>
      <select id="modal-dispo-source"><option value="">-- wybierz --</option><option value="Dyspozytura">Dyspozytura</option><option value="PLK">PLK</option><option value="Inny">Inny</option></select>
    </label>
    <label><span>Treść dyspozycji</span><textarea id="modal-dispo-text"></textarea></label>
  `, () => {
    const source = qs("#modal-dispo-source").value;
    const text = qs("#modal-dispo-text").value.trim();
    if (!source || !text) { alert("Wybierz źródło i wpisz treść."); return; }
    report.dispos.push({ source, text });
    upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
  });
});

qs("#add-remark-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal("Dodaj uwagę", `<label><span>Treść uwagi</span><textarea id="modal-remark-text"></textarea></label>`, () => {
    const text = qs("#modal-remark-text").value.trim();
    if (!text) { alert("Wpisz treść uwagi."); return; }
    report.remarks.push({ text });
    upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
  });
});

/* Delegacja edycji/usuwania */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const role = btn.getAttribute("data-role");
  if (!role) return;
  if (readOnlyMode) return;
  const type = btn.getAttribute("data-type");
  const index = parseInt(btn.getAttribute("data-index"), 10);
  const report = readReportFromForm();

  if (role === "delete") {
    if (type === "loco") report.consist.locos.splice(index,1);
    else if (type === "wagon") report.consist.wagons.splice(index,1);
    else if (type === "crew") report.crew.splice(index,1);
    else if (type === "run") report.runs.splice(index,1);
    else if (type === "dispo") report.dispos.splice(index,1);
    else if (type === "remark") report.remarks.splice(index,1);
    upsertReport(report); loadReportIntoForm(report, false); refreshLists();
  }

  if (role === "edit") {
    // edycja analogiczna do dodawania — otwieramy modal z wypełnionymi polami
    if (type === "loco") {
      const item = report.consist.locos[index];
      openModal("Edytuj lokomotywę", `
        <label><span>Oznaczenie</span><input id="modal-loco-mark" type="text" value="${escapeAttr(item.mark)}" /></label>
        <label><span>Stacja od</span><input id="modal-loco-from" type="text" value="${escapeAttr(item.from)}" /></label>
        <label><span>Stacja do</span><input id="modal-loco-to" type="text" value="${escapeAttr(item.to)}" /></label>
      `, () => {
        const mark = qs("#modal-loco-mark").value.trim();
        const from = qs("#modal-loco-from").value.trim();
        const to = qs("#modal-loco-to").value.trim();
        if (!mark) { alert("Podaj oznaczenie."); return; }
        report.consist.locos[index] = { mark, from, to };
        upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
      });
    } else if (type === "wagon") {
      const item = report.consist.wagons[index];
      openModal("Edytuj wagon", `
        <label><span>Oznaczenie (max 5)</span><input id="modal-wagon-mark" maxlength="5" type="text" value="${escapeAttr(item.mark)}" /></label>
        <label><span>Stacja od</span><input id="modal-wagon-from" type="text" value="${escapeAttr(item.from)}" /></label>
        <label><span>Stacja do</span><input id="modal-wagon-to" type="text" value="${escapeAttr(item.to)}" /></label>
      `, () => {
        const mark = qs("#modal-wagon-mark").value.trim();
        const from = qs("#modal-wagon-from").value.trim();
        const to = qs("#modal-wagon-to").value.trim();
        if (!mark) { alert("Podaj oznaczenie."); return; }
        if (mark.length > 5) { alert("Max 5 znaków."); return; }
        report.consist.wagons[index] = { mark, from, to };
        upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
      });
    } else if (type === "crew") {
      const item = report.crew[index];
      openModal("Edytuj pracownika", `
        <label><span>Imię i nazwisko</span><input id="modal-crew-name" type="text" value="${escapeAttr(item.name)}" /></label>
        <label><span>Funkcja</span>
          <select id="modal-crew-role"><option value="">--</option>
            <option value="M" ${item.role==="M"?"selected":""}>M</option>
            <option value="KP" ${item.role==="KP"?"selected":""}>KP</option>
            <option value="ZS" ${item.role==="ZS"?"selected":""}>ZS</option>
            <option value="R" ${item.role==="R"?"selected":""}>R</option>
          </select>
        </label>
        <label><span>Stacja od</span><input id="modal-crew-from" type="text" value="${escapeAttr(item.from)}" /></label>
        <label><span>Stacja do</span><input id="modal-crew-to" type="text" value="${escapeAttr(item.to)}" /></label>
      `, () => {
        const name = qs("#modal-crew-name").value.trim();
        const role = qs("#modal-crew-role").value;
        const from = qs("#modal-crew-from").value.trim();
        const to = qs("#modal-crew-to").value.trim();
        if (!name || !role) { alert("Podaj imię i funkcję."); return; }
        report.crew[index] = { name, role, from, to };
        upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
      });
    } else if (type === "run") {
      const item = report.runs[index];
      openModal("Edytuj wpis jazdy", `
        <label><span>Stacja</span><input id="modal-run-station" type="text" value="${escapeAttr(item.station)}" /></label>
        <label><span>Plan przyj.</span><input id="modal-run-planned-arr" type="datetime-local" value="${escapeAttr(item.plannedArr||"")}" /></label>
        <label><span>Rzecz. przyj.</span><input id="modal-run-actual-arr" type="datetime-local" value="${escapeAttr(item.actualArr||"")}" /></label>
        <label><span>Plan odj.</span><input id="modal-run-planned-dep" type="datetime-local" value="${escapeAttr(item.plannedDep||"")}" /></label>
        <label><span>Rzecz. odj.</span><input id="modal-run-actual-dep" type="datetime-local" value="${escapeAttr(item.actualDep||"")}" /></label>
        <label><span>Powód</span><input id="modal-run-delay-reason" type="text" value="${escapeAttr(item.delayReason||"")}" /></label>
        <label><span>Rozkazy</span><textarea id="modal-run-orders">${escapeAttr(item.orders||"")}</textarea></label>
      `, () => {
        const station = qs("#modal-run-station").value.trim();
        const plannedArr = qs("#modal-run-planned-arr").value;
        const actualArr = qs("#modal-run-actual-arr").value;
        const plannedDep = qs("#modal-run-planned-dep").value;
        const actualDep = qs("#modal-run-actual-dep").value;
        const delayReason = qs("#modal-run-delay-reason").value.trim();
        const orders = qs("#modal-run-orders").value.trim();
        if (!station) { alert("Podaj stację."); return; }
        report.runs[index] = { station, plannedArr, actualArr, plannedDep, actualDep, delayReason, orders };
        upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
      });
    } else if (type === "dispo") {
      const item = report.dispos[index];
      openModal("Edytuj dyspozycję", `
        <label><span>Źródło</span>
          <select id="modal-dispo-source"><option value="">--</option>
            <option value="Dyspozytura" ${item.source==="Dyspozytura"?"selected":""}>Dyspozytura</option>
            <option value="PLK" ${item.source==="PLK"?"selected":""}>PLK</option>
            <option value="Inny" ${item.source==="Inny"?"selected":""}>Inny</option>
          </select>
        </label>
        <label><span>Treść</span><textarea id="modal-dispo-text">${escapeAttr(item.text)}</textarea></label>
      `, () => {
        const source = qs("#modal-dispo-source").value;
        const text = qs("#modal-dispo-text").value.trim();
        if (!source || !text) { alert("Wypełnij pola."); return; }
        report.dispos[index] = { source, text };
        upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
      });
    } else if (type === "remark") {
      const item = report.remarks[index];
      openModal("Edytuj uwagę", `<label><span>Treść</span><textarea id="modal-remark-text">${escapeAttr(item.text)}</textarea></label>`, () => {
        const text = qs("#modal-remark-text").value.trim();
        if (!text) { alert("Wpisz treść."); return; }
        report.remarks[index] = { text };
        upsertReport(report); loadReportIntoForm(report, false); closeModal(); refreshLists();
      });
    }
  }
});

/* ---------- save / pdf / finish / handover ---------- */
qs("#save-report-btn").addEventListener("click", () => {
  const r = readReportFromForm();
  upsertReport(r);
  alert("Raport zapisany lokalnie (demo).");
  refreshLists();
});

qs("#generate-pdf-btn").addEventListener("click", () => {
  window.print();
});

qs("#finish-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openConfirm("Zamknięcie obsługi spowoduje ostateczne zapisanie danych, których nie będzie można poprawić. Czy chcesz zamknąć?", () => {
    report.status = "finished";
    upsertReport(report);
    loadReportIntoForm(report, true);
    refreshLists();
  });
});

qs("#handover-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  if (!report.general.trainNumber || !report.general.date) {
    alert("Podaj numer pociągu i dzień kursowania przed przekazaniem.");
    return;
  }
  report.status = "handed_over";
  upsertReport(report);
  loadReportIntoForm(report, false);
  refreshLists();
  alert("Pociąg przekazany do przejęcia.");
});

/* ---------- lists: takeover / check / dyspo ---------- */
function refreshLists() {
  const reports = loadReports();

  // takeover
  const takeoverTbody = qs("#takeover-table tbody"); takeoverTbody.innerHTML = "";
  reports.filter(r => r.status === "handed_over").forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.general.trainNumber)}</td><td>${escapeHtml(r.general.from)} – ${escapeHtml(r.general.to)}</td><td>${escapeHtml(r.general.date)}</td>
      <td><button class="btn small" data-action="takeover" data-id="${r.id}">Przejmij</button></td>`;
    takeoverTbody.appendChild(tr);
  });

  // check (today and yesterday)
  const checkTbody = qs("#check-table tbody"); checkTbody.innerHTML = "";
  const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
  const dateToStr = d => d.toISOString().slice(0,10);
  reports.forEach(r => {
    if (!r.general.date) return;
    if (r.general.date === dateToStr(today) || r.general.date === dateToStr(yesterday)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(r.general.trainNumber)}</td><td>${escapeHtml(r.general.from)} – ${escapeHtml(r.general.to)}</td><td>${escapeHtml(r.general.date)}</td>
        <td><button class="btn small" data-action="preview" data-id="${r.id}">Podgląd</button></td>`;
      checkTbody.appendChild(tr);
    }
  });

  // dyspo
  const dyspoTbody = qs("#dyspo-table tbody"); dyspoTbody.innerHTML = "";
  reports.filter(r => r.status !== "finished").forEach(r => {
    const lastRun = r.runs[r.runs.length-1];
    const station = lastRun ? lastRun.station : "-";
    let delay = 0;
    if (lastRun) {
      const delayArr = calculateDelayMinutes(lastRun.plannedArr, lastRun.actualArr);
      const delayDep = calculateDelayMinutes(lastRun.plannedDep, lastRun.actualDep);
      delay = (delayArr || 0);
      if (delayDep !== null && Math.abs(delayDep) > Math.abs(delay)) delay = delayDep;
    }
    const tr = document.createElement("tr");
    if (delay > 20) tr.classList.add("row-critical-delay");
    tr.innerHTML = `<td>${escapeHtml(r.general.trainNumber)}</td><td>${escapeHtml(r.general.from)} – ${escapeHtml(r.general.to)}</td><td>${escapeHtml(station)}</td><td>${escapeHtml(String(delay))}</td>`;
    dyspoTbody.appendChild(tr);
  });
}

/* takeover / preview actions */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  if (!action) return;
  const id = btn.getAttribute("data-id");
  const report = getReportById(id);
  if (!report) { alert("Nie znaleziono raportu."); return; }
  if (action === "takeover") {
    report.status = "in_progress";
    upsertReport(report);
    loadReportIntoForm(report, false);
    const nav = qsa('.nav-btn[data-panel="handle-train"]')[0];
    if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
    refreshLists();
  } else if (action === "preview") {
    loadReportIntoForm(report, true);
    const nav = qsa('.nav-btn[data-panel="handle-train"]')[0];
    if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
  }
});

/* manual refresh buttons */
qs("#refresh-takeover").addEventListener("click", refreshLists);
qs("#refresh-check").addEventListener("click", refreshLists);
qs("#refresh-dyspo").addEventListener("click", refreshLists);

/* auto-refresh dyspo when visible every 3 minutes */
setInterval(() => {
  const el = qs("#panel-dyspo");
  if (el && !el.hidden) refreshLists();
}, 3 * 60 * 1000);

/* new report */
qs("#new-report-btn").addEventListener("click", () => {
  const r = createEmptyReport();
  upsertReport(r);
  loadReportIntoForm(r, false);
  const nav = qsa('.nav-btn[data-panel="handle-train"]')[0];
  if (nav) { qsa(".nav-btn").forEach(b => b.classList.remove("active")); nav.classList.add("active"); showPanel("handle-train"); }
  refreshLists();
});

/* initial load */
window.addEventListener("load", () => {
  if (!loadReports().length) {
    const r = createEmptyReport();
    upsertReport(r);
  }
  refreshLists();
});

/* ---------- confirm modal ---------- */
const confirmBackdrop = qs("#confirm-backdrop");
const confirmMessage = qs("#confirm-message");
const confirmOkBtn = qs("#confirm-ok-btn");
const confirmCancelBtn = qs("#confirm-cancel-btn");
let confirmHandler = null;
function openConfirm(message, onOk) {
  confirmMessage.textContent = message;
  confirmHandler = onOk;
  confirmBackdrop.classList.remove("hidden");
  confirmBackdrop.setAttribute("aria-hidden","false");
  confirmCancelBtn.focus();
}
function closeConfirm() {
  confirmBackdrop.classList.add("hidden");
  confirmBackdrop.setAttribute("aria-hidden","true");
  confirmHandler = null;
}
confirmCancelBtn.addEventListener("click", closeConfirm);
confirmOkBtn.addEventListener("click", () => { if (confirmHandler) confirmHandler(); closeConfirm(); });

/* ---------- utilities ---------- */
function escapeHtml(s){ if (!s && s!==0) return ""; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
