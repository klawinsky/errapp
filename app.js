/* eRegioJet demo - wszystkie zakładki na jednej stronie
   Dane przechowywane w localStorage (STORAGE_KEY).
   Plik gotowy do wgrania na GitHub Pages.
*/

const STORAGE_KEY = "eRegioJet_demo_reports_v2";

let currentReportId = null;
let readOnlyMode = false;

/* -------------------------
   Proste UI helpers
   ------------------------- */
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function showLoggedIn(email) {
  qs("#login-area").classList.add("hidden");
  const ua = qs("#user-area");
  ua.classList.remove("hidden");
  qs("#user-email-display").textContent = email || "Użytkownik (DEMO)";
  // enable sidebar
  qsa(".nav-link").forEach(n => n.classList.remove("disabled"));
}

function showLoggedOut() {
  qs("#login-area").classList.remove("hidden");
  qs("#user-area").classList.add("hidden");
}

/* Smooth scroll from sidebar buttons */
qsa("[data-scroll]").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = document.querySelector(btn.getAttribute("data-scroll"));
    if (target) target.scrollIntoView({behavior:"smooth", block:"start"});
  });
});

/* Highlight active nav link on scroll */
const navLinks = qsa(".nav-link");
const panels = navLinks.map(a => document.querySelector(a.getAttribute("href")));
function onScrollHighlight() {
  const top = window.scrollY + 120;
  let activeIndex = 0;
  panels.forEach((p, i) => {
    if (p && p.offsetTop <= top) activeIndex = i;
  });
  navLinks.forEach((a,i) => a.classList.toggle("active", i === activeIndex));
}
window.addEventListener("scroll", onScrollHighlight);
onScrollHighlight();

/* -------------------------
   Storage: load / save
   ------------------------- */
function loadReports() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch(e) { console.error(e); return []; }
}
function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}
function createEmptyReport() {
  return {
    id: Date.now().toString(),
    status: "in_progress",
    general: { trainNumber:"", date:"", from:"", to:"" },
    consist: { locos:[], wagons:[] },
    crew: [],
    runs: [],
    dispos: [],
    remarks: []
  };
}
function getReportById(id) {
  return loadReports().find(r => r.id === id) || null;
}
function upsertReport(report) {
  const reports = loadReports();
  const idx = reports.findIndex(r => r.id === report.id);
  if (idx === -1) reports.push(report); else reports[idx] = report;
  saveReports(reports);
}

/* -------------------------
   Init: demo login and initial report
   ------------------------- */
qs("#login-demo-btn").addEventListener("click", () => {
  const email = qs("#login-email").value.trim() || "demo@eregiojet.local";
  showLoggedIn(email);
  // create initial report if none
  if (!loadReports().length) {
    const r = createEmptyReport();
    upsertReport(r);
    loadReportIntoForm(r, false);
  } else {
    // load last in_progress or newest
    const reports = loadReports();
    const inProg = reports.find(r => r.status === "in_progress");
    const toLoad = inProg || reports[reports.length-1];
    if (toLoad) loadReportIntoForm(toLoad, false);
  }
  // scroll to menu
  document.querySelector("#menu").scrollIntoView({behavior:"smooth"});
});

qs("#logout-btn").addEventListener("click", () => {
  showLoggedOut();
});

/* -------------------------
   Read / write form
   ------------------------- */
function readReportFromForm() {
  if (!currentReportId) currentReportId = Date.now().toString();
  let report = getReportById(currentReportId);
  if (!report) {
    report = createEmptyReport();
    report.id = currentReportId;
  }
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

  // disable controls if readOnly or finished
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

/* Auto-save on general fields change */
["#general-train-number","#general-date","#general-from","#general-to"].forEach(sel => {
  const el = qs(sel);
  if (!el) return;
  el.addEventListener("change", () => {
    if (readOnlyMode) return;
    const r = readReportFromForm();
    upsertReport(r);
    refreshLists();
  });
});

/* -------------------------
   Render helpers
   ------------------------- */
function renderConsist(report) {
  const locoTbody = qs("#loco-table tbody"); const wagonTbody = qs("#wagon-table tbody");
  locoTbody.innerHTML = ""; wagonTbody.innerHTML = "";
  report.consist.locos.forEach((l, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(l.mark)}</td><td>${escapeHtml(l.from)}</td><td>${escapeHtml(l.to)}</td>
      <td><button class="btn small" data-role="edit" data-type="loco" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="loco" data-index="${i}">Usuń</button></td>`;
    locoTbody.appendChild(tr);
  });
  report.consist.wagons.forEach((w, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(w.mark)}</td><td>${escapeHtml(w.from)}</td><td>${escapeHtml(w.to)}</td>
      <td><button class="btn small" data-role="edit" data-type="wagon" data-index="${i}">Edytuj</button>
      <button class="btn warning small" data-role="delete" data-type="wagon" data-index="${i}">Usuń</button></td>`;
    wagonTbody.appendChild(tr);
  });
}

function renderCrew(report) {
  const tbody = qs("#crew-table tbody"); tbody.innerHTML = "";
  report.crew.forEach((c,i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.role)}</td><td>${escapeHtml(c.from)}</td><td>${escapeHtml(c.to)}</td>
      <td><button class="btn small" data-role="edit" data-type="crew" data-index="${i}">Edytuj</button>
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
      <td><button class="btn small" data-role="edit" data-type="run" data-index="${i}">Edytuj</button>
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

/* -------------------------
   Modal system
   ------------------------- */
const modalBackdrop = qs("#modal-backdrop");
const modalTitle = qs("#modal-title");
const modalBody = qs("#modal-body");
const modalSaveBtn = qs("#modal-save-btn");
const modalCancelBtn = qs("#modal-cancel-btn");
let modalSaveHandler = null;

function openModal(title, bodyHtml, onSave) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalSaveHandler = onSave;
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden","false");
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden","true");
  modalSaveHandler = null;
}
modalCancelBtn.addEventListener("click", closeModal);
modalSaveBtn.addEventListener("click", () => { if (modalSaveHandler) modalSaveHandler(); });

/* Confirm */
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
}
function closeConfirm() {
  confirmBackdrop.classList.add("hidden");
  confirmBackdrop.setAttribute("aria-hidden","true");
  confirmHandler = null;
}
confirmCancelBtn.addEventListener("click", closeConfirm);
confirmOkBtn.addEventListener("click", () => { if (confirmHandler) confirmHandler(); closeConfirm(); });

/* -------------------------
   Add / Edit actions
   ------------------------- */
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

/* Delegacja edycji / usuwania */
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

/* -------------------------
   Finish / Handover / Save / PDF
   ------------------------- */
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

/* -------------------------
   Lists: takeover, check, dyspo
   ------------------------- */
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

/* Click handlers for takeover / preview */
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
    document.querySelector("#handle-train").scrollIntoView({behavior:"smooth"});
    refreshLists();
  } else if (action === "preview") {
    loadReportIntoForm(report, true);
    document.querySelector("#handle-train").scrollIntoView({behavior:"smooth"});
  }
});

/* Manual refresh buttons */
qs("#refresh-takeover").addEventListener("click", refreshLists);
qs("#refresh-check").addEventListener("click", refreshLists);
qs("#refresh-dyspo").addEventListener("click", refreshLists);

/* Auto-refresh dyspo every 3 minutes when visible */
setInterval(() => {
  const rect = qs("#dyspo").getBoundingClientRect();
  if (rect.top >= 0 && rect.top < window.innerHeight) refreshLists();
}, 3 * 60 * 1000);

/* New report button */
qs("#new-report-btn").addEventListener("click", () => {
  const r = createEmptyReport();
  upsertReport(r);
  loadReportIntoForm(r, false);
  document.querySelector("#handle-train").scrollIntoView({behavior:"smooth"});
  refreshLists();
});

/* On load: create one empty report if none */
window.addEventListener("load", () => {
  if (!loadReports().length) {
    const r = createEmptyReport();
    upsertReport(r);
  }
  refreshLists();
});

/* -------------------------
   Small utilities
   ------------------------- */
function escapeHtml(s){ if (!s && s!==0) return ""; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
