// Klucz pod którym trzymamy dane w localStorage
const STORAGE_KEY = "eRegioJet_demo_reports";

// Aktualnie edytowany raport
let currentReportId = null;
// Czy ekran "Obsłuż pociąg" jest w trybie tylko do odczytu
let readOnlyMode = false;

// Proste przełączanie ekranów
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// Ładowanie i zapisywanie wszystkich raportów
function loadReports() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Błąd parsowania danych", e);
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

// Tworzenie pustego raportu
function createEmptyReport() {
  return {
    id: Date.now().toString(),
    status: "in_progress", // in_progress | handed_over | finished
    general: {
      trainNumber: "",
      date: "",
      from: "",
      to: "",
    },
    consist: {
      locos: [],
      wagons: [],
    },
    crew: [],
    runs: [],
    dispos: [],
    remarks: [],
  };
}

// Znajdź raport po ID
function getReportById(id) {
  const reports = loadReports();
  return reports.find((r) => r.id === id) || null;
}

// Zapisz raport (nadpisanie)
function upsertReport(report) {
  const reports = loadReports();
  const idx = reports.findIndex((r) => r.id === report.id);
  if (idx === -1) {
    reports.push(report);
  } else {
    reports[idx] = report;
  }
  saveReports(reports);
}

// Ustaw status etykiety na dole
function updateStatusLabel(report) {
  const label = document.getElementById("report-status-label");
  if (!report) {
    label.textContent = "";
    return;
  }
  if (report.status === "finished") {
    label.textContent = "Status: Zakończona (tylko do odczytu)";
  } else if (report.status === "handed_over") {
    label.textContent = "Status: Przekazana do przejęcia";
  } else {
    label.textContent = "Status: W trakcie prowadzenia";
  }
}

// Wczytaj raport do formularza
function loadReportIntoForm(report, isReadOnly) {
  readOnlyMode = isReadOnly;
  currentReportId = report.id;

  document.getElementById("general-train-number").value = report.general.trainNumber || "";
  document.getElementById("general-date").value = report.general.date || "";
  document.getElementById("general-from").value = report.general.from || "";
  document.getElementById("general-to").value = report.general.to || "";

  renderConsist(report);
  renderCrew(report);
  renderRuns(report);
  renderDispos(report);
  renderRemarks(report);
  updateStatusLabel(report);

  // Jeśli tryb tylko do odczytu – blokujemy edycję
  const controlsToDisable = [
    "add-loco-btn",
    "add-wagon-btn",
    "add-crew-btn",
    "add-run-btn",
    "add-dispo-btn",
    "add-remark-btn",
    "finish-btn",
    "handover-btn",
  ];
  controlsToDisable.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = isReadOnly || report.status === "finished";
  });

  // Pola ogólne
  ["general-train-number", "general-date", "general-from", "general-to"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = isReadOnly || report.status === "finished";
  });

  // Ukryj przyciski edycji w tabelach jeśli read-only
  document.querySelectorAll("[data-role='edit-btn'], [data-role='delete-btn']").forEach((btn) => {
    btn.style.display = isReadOnly || report.status === "finished" ? "none" : "inline-block";
  });
}

// Pobierz raport z formularza
function readReportFromForm() {
  if (!currentReportId) {
    currentReportId = Date.now().toString();
  }
  const reports = loadReports();
  let report = reports.find((r) => r.id === currentReportId);
  if (!report) {
    report = createEmptyReport();
    report.id = currentReportId;
  }
  report.general.trainNumber = document.getElementById("general-train-number").value.trim();
  report.general.date = document.getElementById("general-date").value;
  report.general.from = document.getElementById("general-from").value.trim();
  report.general.to = document.getElementById("general-to").value.trim();
  return report;
}

// Zapisywanie na bieżąco przy zmianie pól ogólnych
["general-train-number", "general-date", "general-from", "general-to"].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("change", () => {
    if (readOnlyMode) return;
    let report = readReportFromForm();
    upsertReport(report);
    refreshLists();
  });
});

// Render skład pociągu
function renderConsist(report) {
  const locoTbody = document.querySelector("#loco-table tbody");
  const wagonTbody = document.querySelector("#wagon-table tbody");
  locoTbody.innerHTML = "";
  wagonTbody.innerHTML = "";

  report.consist.locos.forEach((l, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.mark}</td>
      <td>${l.from}</td>
      <td>${l.to}</td>
      <td>
        <button class="btn small" data-role="edit-btn" data-type="loco" data-index="${index}">Edytuj</button>
        <button class="btn small warning" data-role="delete-btn" data-type="loco" data-index="${index}">Usuń</button>
      </td>
    `;
    locoTbody.appendChild(tr);
  });

  report.consist.wagons.forEach((w, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${w.mark}</td>
      <td>${w.from}</td>
      <td>${w.to}</td>
      <td>
        <button class="btn small" data-role="edit-btn" data-type="wagon" data-index="${index}">Edytuj</button>
        <button class="btn small warning" data-role="delete-btn" data-type="wagon" data-index="${index}">Usuń</button>
      </td>
    `;
    wagonTbody.appendChild(tr);
  });

  if (readOnlyMode) {
    document.querySelectorAll("#loco-table [data-role], #wagon-table [data-role]").forEach((btn) => {
      btn.style.display = "none";
    });
  }
}

// Render drużyny
function renderCrew(report) {
  const tbody = document.querySelector("#crew-table tbody");
  tbody.innerHTML = "";
  report.crew.forEach((c, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.role}</td>
      <td>${c.from}</td>
      <td>${c.to}</td>
      <td>
        <button class="btn small" data-role="edit-btn" data-type="crew" data-index="${index}">Edytuj</button>
        <button class="btn small warning" data-role="delete-btn" data-type="crew" data-index="${index}">Usuń</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (readOnlyMode) {
    document.querySelectorAll("#crew-table [data-role]").forEach((btn) => {
      btn.style.display = "none";
    });
  }
}

// Pomocnicza funkcja: policz odchylenie w minutach
function calculateDelayMinutes(planned, actual) {
  if (!planned || !actual) return null;
  const p = new Date(planned);
  const a = new Date(actual);
  if (isNaN(p.getTime()) || isNaN(a.getTime())) return null;
  const diffMs = a.getTime() - p.getTime();
  return Math.round(diffMs / 60000);
}

function formatDelayCell(delay) {
  if (delay === null) return "";
  if (delay < 0) {
    return `<span class="delay-early">${delay} min</span>`;
  } else if (delay > 0) {
    return `<span class="delay-late">+${delay} min</span>`;
  } else {
    return `<span class="delay-on-time">0 min</span>`;
  }
}

// Render dane o jeździe
function renderRuns(report) {
  const tbody = document.querySelector("#run-table tbody");
  tbody.innerHTML = "";
  report.runs.forEach((r, index) => {
    const delayArr = calculateDelayMinutes(r.plannedArr, r.actualArr);
    const delayDep = calculateDelayMinutes(r.plannedDep, r.actualDep);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.station}</td>
      <td>${r.plannedArr || ""}</td>
      <td>${r.actualArr || ""}</td>
      <td>${formatDelayCell(delayArr)}</td>
      <td>${r.plannedDep || ""}</td>
      <td>${r.actualDep || ""}</td>
      <td>${formatDelayCell(delayDep)}</td>
      <td>${r.delayReason || ""}</td>
      <td>${r.orders || ""}</td>
      <td>
        <button class="btn small" data-role="edit-btn" data-type="run" data-index="${index}">Edytuj</button>
        <button class="btn small warning" data-role="delete-btn" data-type="run" data-index="${index}">Usuń</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (readOnlyMode) {
    document.querySelectorAll("#run-table [data-role]").forEach((btn) => {
      btn.style.display = "none";
    });
  }
}

// Render dyspozycji
function renderDispos(report) {
  const list = document.getElementById("dispo-list");
  list.innerHTML = "";
  report.dispos.forEach((d, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${d.source}:</strong> ${d.text}
      <div style="margin-top:4px;">
        <button class="btn small" data-role="edit-btn" data-type="dispo" data-index="${index}">Edytuj</button>
        <button class="btn small warning" data-role="delete-btn" data-type="dispo" data-index="${index}">Usuń</button>
      </div>
    `;
    list.appendChild(li);
  });

  if (readOnlyMode) {
    document.querySelectorAll("#dispo-list [data-role]").forEach((btn) => {
      btn.style.display = "none";
    });
  }
}

// Render uwag
function renderRemarks(report) {
  const list = document.getElementById("remark-list");
  list.innerHTML = "";
  report.remarks.forEach((r, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${r.text}
      <div style="margin-top:4px;">
        <button class="btn small" data-role="edit-btn" data-type="remark" data-index="${index}">Edytuj</button>
        <button class="btn small warning" data-role="delete-btn" data-type="remark" data-index="${index}">Usuń</button>
      </div>
    `;
    list.appendChild(li);
  });

  if (readOnlyMode) {
    document.querySelectorAll("#remark-list [data-role]").forEach((btn) => {
      btn.style.display = "none";
    });
  }
}

// Prost y system modali
const modalBackdrop = document.getElementById("modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalSaveBtn = document.getElementById("modal-save-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");

let modalSaveHandler = null;

function openModal(title, bodyHtml, onSave) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalSaveHandler = onSave;
  modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalSaveHandler = null;
}

modalCancelBtn.addEventListener("click", closeModal);
modalSaveBtn.addEventListener("click", () => {
  if (modalSaveHandler) modalSaveHandler();
});

// Modal potwierdzenia
const confirmBackdrop = document.getElementById("confirm-backdrop");
const confirmMessage = document.getElementById("confirm-message");
const confirmOkBtn = document.getElementById("confirm-ok-btn");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");

let confirmHandler = null;

function openConfirm(message, onOk) {
  confirmMessage.textContent = message;
  confirmHandler = onOk;
  confirmBackdrop.classList.remove("hidden");
}

function closeConfirm() {
  confirmBackdrop.classList.add("hidden");
  confirmHandler = null;
}

confirmCancelBtn.addEventListener("click", closeConfirm);
confirmOkBtn.addEventListener("click", () => {
  if (confirmHandler) confirmHandler();
  closeConfirm();
});

// Obsługa przycisku DEMO - logowanie
document.getElementById("login-demo-btn").addEventListener("click", () => {
  showScreen("menu-screen");
});

// Wylogowanie
document.getElementById("logout-btn").addEventListener("click", () => {
  showScreen("login-screen");
});

// Przyciski nawigacji z atrybutem data-target
document.querySelectorAll("[data-target]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-target");
    showScreen(target);
    if (target === "takeover-screen" || target === "check-train-screen" || target === "dyspo-screen") {
      refreshLists();
    }
  });
});

// Obsługa dodawania / edycji / usuwania – skład pociągu, drużyna, jazda, dyspozycje, uwagi

// Dodaj lokomotywę
document.getElementById("add-loco-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal(
    "Dodaj lokomotywę",
    `
    <label>
      <span>Oznaczenie lokomotywy</span>
      <input type="text" id="modal-loco-mark" />
    </label>
    <label>
      <span>Stacja od</span>
      <input type="text" id="modal-loco-from" />
    </label>
    <label>
      <span>Stacja do</span>
      <input type="text" id="modal-loco-to" />
    </label>
  `,
    () => {
      const mark = document.getElementById("modal-loco-mark").value.trim();
      const from = document.getElementById("modal-loco-from").value.trim();
      const to = document.getElementById("modal-loco-to").value.trim();
      if (!mark) {
        alert("Podaj oznaczenie lokomotywy.");
        return;
      }
      report.consist.locos.push({ mark, from, to });
      upsertReport(report);
      loadReportIntoForm(report, false);
      closeModal();
      refreshLists();
    }
  );
});

// Dodaj wagon
document.getElementById("add-wagon-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal(
    "Dodaj wagon",
    `
    <label>
      <span>Oznaczenie wagonu (max 5 znaków)</span>
      <input type="text" id="modal-wagon-mark" maxlength="5" />
    </label>
    <label>
      <span>Stacja od</span>
      <input type="text" id="modal-wagon-from" />
    </label>
    <label>
      <span>Stacja do</span>
      <input type="text" id="modal-wagon-to" />
    </label>
  `,
    () => {
      const mark = document.getElementById("modal-wagon-mark").value.trim();
      const from = document.getElementById("modal-wagon-from").value.trim();
      const to = document.getElementById("modal-wagon-to").value.trim();
      if (!mark) {
        alert("Podaj oznaczenie wagonu.");
        return;
      }
      if (mark.length > 5) {
        alert("Oznaczenie wagonu może mieć maksymalnie 5 znaków.");
        return;
      }
      report.consist.wagons.push({ mark, from, to });
      upsertReport(report);
      loadReportIntoForm(report, false);
      closeModal();
      refreshLists();
    }
  );
});

// Dodaj pracownika
document.getElementById("add-crew-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal(
    "Dodaj pracownika",
    `
    <label>
      <span>Imię i nazwisko</span>
      <input type="text" id="modal-crew-name" />
    </label>
    <label>
      <span>Funkcja (M, KP, ZS, R)</span>
      <select id="modal-crew-role">
        <option value="">-- wybierz --</option>
        <option value="M">M</option>
        <option value="KP">KP</option>
        <option value="ZS">ZS</option>
        <option value="R">R</option>
      </select>
    </label>
    <label>
      <span>Stacja od</span>
      <input type="text" id="modal-crew-from" />
    </label>
    <label>
      <span>Stacja do</span>
      <input type="text" id="modal-crew-to" />
    </label>
  `,
    () => {
      const name = document.getElementById("modal-crew-name").value.trim();
      const role = document.getElementById("modal-crew-role").value;
      const from = document.getElementById("modal-crew-from").value.trim();
      const to = document.getElementById("modal-crew-to").value.trim();
      if (!name || !role) {
        alert("Podaj imię, nazwisko i funkcję.");
        return;
      }
      report.crew.push({ name, role, from, to });
      upsertReport(report);
      loadReportIntoForm(report, false);
      closeModal();
      refreshLists();
    }
  );
});

// Dodaj wpis jazdy
document.getElementById("add-run-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal(
    "Dodaj wpis jazdy",
    `
    <label>
      <span>Nazwa stacji</span>
      <input type="text" id="modal-run-station" />
    </label>
    <label>
      <span>Planowy przyjazd</span>
      <input type="datetime-local" id="modal-run-planned-arr" />
    </label>
    <label>
      <span>Rzeczywisty przyjazd</span>
      <input type="datetime-local" id="modal-run-actual-arr" />
    </label>
    <label>
      <span>Planowy odjazd</span>
      <input type="datetime-local" id="modal-run-planned-dep" />
    </label>
    <label>
      <span>Rzeczywisty odjazd</span>
      <input type="datetime-local" id="modal-run-actual-dep" />
    </label>
    <label>
      <span>Powód opóźnienia</span>
      <input type="text" id="modal-run-delay-reason" />
    </label>
    <label>
      <span>Otrzymane rozkazy</span>
      <textarea id="modal-run-orders"></textarea>
    </label>
  `,
    () => {
      const station = document.getElementById("modal-run-station").value.trim();
      const plannedArr = document.getElementById("modal-run-planned-arr").value;
      const actualArr = document.getElementById("modal-run-actual-arr").value;
      const plannedDep = document.getElementById("modal-run-planned-dep").value;
      const actualDep = document.getElementById("modal-run-actual-dep").value;
      const delayReason = document.getElementById("modal-run-delay-reason").value.trim();
      const orders = document.getElementById("modal-run-orders").value.trim();
      if (!station) {
        alert("Podaj nazwę stacji.");
        return;
      }
      report.runs.push({
        station,
        plannedArr,
        actualArr,
        plannedDep,
        actualDep,
        delayReason,
        orders,
      });
      upsertReport(report);
      loadReportIntoForm(report, false);
      closeModal();
      refreshLists();
    }
  );
});

// Dodaj dyspozycję
document.getElementById("add-dispo-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal(
    "Dodaj dyspozycję",
    `
    <label>
      <span>Kto wydał dyspozycję</span>
      <select id="modal-dispo-source">
        <option value="">-- wybierz --</option>
        <option value="Dyspozytura">Dyspozytura</option>
        <option value="PLK">PLK</option>
        <option value="Inny">Inny</option>
      </select>
    </label>
    <label>
      <span>Treść dyspozycji</span>
      <textarea id="modal-dispo-text"></textarea>
    </label>
  `,
    () => {
      const source = document.getElementById("modal-dispo-source").value;
      const text = document.getElementById("modal-dispo-text").value.trim();
      if (!source || !text) {
        alert("Wybierz źródło i wpisz treść dyspozycji.");
        return;
      }
      report.dispos.push({ source, text });
      upsertReport(report);
      loadReportIntoForm(report, false);
      closeModal();
      refreshLists();
    }
  );
});

// Dodaj uwagę
document.getElementById("add-remark-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openModal(
    "Dodaj uwagę kierownika",
    `
    <label>
      <span>Treść uwagi</span>
      <textarea id="modal-remark-text"></textarea>
    </label>
  `,
    () => {
      const text = document.getElementById("modal-remark-text").value.trim();
      if (!text) {
        alert("Wpisz treść uwagi.");
        return;
      }
      report.remarks.push({ text });
      upsertReport(report);
      loadReportIntoForm(report, false);
      closeModal();
      refreshLists();
    }
  );
});

// Delegacja przycisków edycji / usuwania w tabelach i listach
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const role = btn.getAttribute("data-role");
  if (!role) return;
  if (readOnlyMode) return;

  const type = btn.getAttribute("data-type");
  const index = parseInt(btn.getAttribute("data-index"), 10);
  let report = readReportFromForm();

  if (role === "delete-btn") {
    // Usuń element
    if (type === "loco") {
      report.consist.locos.splice(index, 1);
    } else if (type === "wagon") {
      report.consist.wagons.splice(index, 1);
    } else if (type === "crew") {
      report.crew.splice(index, 1);
    } else if (type === "run") {
      report.runs.splice(index, 1);
    } else if (type === "dispo") {
      report.dispos.splice(index, 1);
    } else if (type === "remark") {
      report.remarks.splice(index, 1);
    }
    upsertReport(report);
    loadReportIntoForm(report, false);
    refreshLists();
  }

  if (role === "edit-btn") {
    // Edytuj element
    if (type === "loco") {
      const item = report.consist.locos[index];
      openModal(
        "Edytuj lokomotywę",
        `
        <label>
          <span>Oznaczenie lokomotywy</span>
          <input type="text" id="modal-loco-mark" value="${item.mark}" />
        </label>
        <label>
          <span>Stacja od</span>
          <input type="text" id="modal-loco-from" value="${item.from}" />
        </label>
        <label>
          <span>Stacja do</span>
          <input type="text" id="modal-loco-to" value="${item.to}" />
        </label>
      `,
        () => {
          const mark = document.getElementById("modal-loco-mark").value.trim();
          const from = document.getElementById("modal-loco-from").value.trim();
          const to = document.getElementById("modal-loco-to").value.trim();
          if (!mark) {
            alert("Podaj oznaczenie lokomotywy.");
            return;
          }
          report.consist.locos[index] = { mark, from, to };
          upsertReport(report);
          loadReportIntoForm(report, false);
          closeModal();
          refreshLists();
        }
      );
    } else if (type === "wagon") {
      const item = report.consist.wagons[index];
      openModal(
        "Edytuj wagon",
        `
        <label>
          <span>Oznaczenie wagonu (max 5 znaków)</span>
          <input type="text" id="modal-wagon-mark" maxlength="5" value="${item.mark}" />
        </label>
        <label>
          <span>Stacja od</span>
          <input type="text" id="modal-wagon-from" value="${item.from}" />
        </label>
        <label>
          <span>Stacja do</span>
          <input type="text" id="modal-wagon-to" value="${item.to}" />
        </label>
      `,
        () => {
          const mark = document.getElementById("modal-wagon-mark").value.trim();
          const from = document.getElementById("modal-wagon-from").value.trim();
          const to = document.getElementById("modal-wagon-to").value.trim();
          if (!mark) {
            alert("Podaj oznaczenie wagonu.");
            return;
          }
          if (mark.length > 5) {
            alert("Oznaczenie wagonu może mieć maksymalnie 5 znaków.");
            return;
          }
          report.consist.wagons[index] = { mark, from, to };
          upsertReport(report);
          loadReportIntoForm(report, false);
          closeModal();
          refreshLists();
        }
      );
    } else if (type === "crew") {
      const item = report.crew[index];
      openModal(
        "Edytuj pracownika",
        `
        <label>
          <span>Imię i nazwisko</span>
          <input type="text" id="modal-crew-name" value="${item.name}" />
        </label>
        <label>
          <span>Funkcja (M, KP, ZS, R)</span>
          <select id="modal-crew-role">
            <option value="">-- wybierz --</option>
            <option value="M" ${item.role === "M" ? "selected" : ""}>M</option>
            <option value="KP" ${item.role === "KP" ? "selected" : ""}>KP</option>
            <option value="ZS" ${item.role === "ZS" ? "selected" : ""}>ZS</option>
            <option value="R" ${item.role === "R" ? "selected" : ""}>R</option>
          </select>
        </label>
        <label>
          <span>Stacja od</span>
          <input type="text" id="modal-crew-from" value="${item.from}" />
        </label>
        <label>
          <span>Stacja do</span>
          <input type="text" id="modal-crew-to" value="${item.to}" />
        </label>
      `,
        () => {
          const name = document.getElementById("modal-crew-name").value.trim();
          const role = document.getElementById("modal-crew-role").value;
          const from = document.getElementById("modal-crew-from").value.trim();
          const to = document.getElementById("modal-crew-to").value.trim();
          if (!name || !role) {
            alert("Podaj imię, nazwisko i funkcję.");
            return;
          }
          report.crew[index] = { name, role, from, to };
          upsertReport(report);
          loadReportIntoForm(report, false);
          closeModal();
          refreshLists();
        }
      );
    } else if (type === "run") {
      const item = report.runs[index];
      openModal(
        "Edytuj wpis jazdy",
        `
        <label>
          <span>Nazwa stacji</span>
          <input type="text" id="modal-run-station" value="${item.station}" />
        </label>
        <label>
          <span>Planowy przyjazd</span>
          <input type="datetime-local" id="modal-run-planned-arr" value="${item.plannedArr || ""}" />
        </label>
        <label>
          <span>Rzeczywisty przyjazd</span>
          <input type="datetime-local" id="modal-run-actual-arr" value="${item.actualArr || ""}" />
        </label>
        <label>
          <span>Planowy odjazd</span>
          <input type="datetime-local" id="modal-run-planned-dep" value="${item.plannedDep || ""}" />
        </label>
        <label>
          <span>Rzeczywisty odjazd</span>
          <input type="datetime-local" id="modal-run-actual-dep" value="${item.actualDep || ""}" />
        </label>
        <label>
          <span>Powód opóźnienia</span>
          <input type="text" id="modal-run-delay-reason" value="${item.delayReason || ""}" />
        </label>
        <label>
          <span>Otrzymane rozkazy</span>
          <textarea id="modal-run-orders">${item.orders || ""}</textarea>
        </label>
      `,
        () => {
          const station = document.getElementById("modal-run-station").value.trim();
          const plannedArr = document.getElementById("modal-run-planned-arr").value;
          const actualArr = document.getElementById("modal-run-actual-arr").value;
          const plannedDep = document.getElementById("modal-run-planned-dep").value;
          const actualDep = document.getElementById("modal-run-actual-dep").value;
          const delayReason = document.getElementById("modal-run-delay-reason").value.trim();
          const orders = document.getElementById("modal-run-orders").value.trim();
          if (!station) {
            alert("Podaj nazwę stacji.");
            return;
          }
          report.runs[index] = {
            station,
            plannedArr,
            actualArr,
            plannedDep,
            actualDep,
            delayReason,
            orders,
          };
          upsertReport(report);
          loadReportIntoForm(report, false);
          closeModal();
          refreshLists();
        }
      );
    } else if (type === "dispo") {
      const item = report.dispos[index];
      openModal(
        "Edytuj dyspozycję",
        `
        <label>
          <span>Kto wydał dyspozycję</span>
          <select id="modal-dispo-source">
            <option value="">-- wybierz --</option>
            <option value="Dyspozytura" ${item.source === "Dyspozytura" ? "selected" : ""}>Dyspozytura</option>
            <option value="PLK" ${item.source === "PLK" ? "selected" : ""}>PLK</option>
            <option value="Inny" ${item.source === "Inny" ? "selected" : ""}>Inny</option>
          </select>
        </label>
        <label>
          <span>Treść dyspozycji</span>
          <textarea id="modal-dispo-text">${item.text}</textarea>
        </label>
      `,
        () => {
          const source = document.getElementById("modal-dispo-source").value;
          const text = document.getElementById("modal-dispo-text").value.trim();
          if (!source || !text) {
            alert("Wybierz źródło i wpisz treść dyspozycji.");
            return;
          }
          report.dispos[index] = { source, text };
          upsertReport(report);
          loadReportIntoForm(report, false);
          closeModal();
          refreshLists();
        }
      );
    } else if (type === "remark") {
      const item = report.remarks[index];
      openModal(
        "Edytuj uwagę",
        `
        <label>
          <span>Treść uwagi</span>
          <textarea id="modal-remark-text">${item.text}</textarea>
        </label>
      `,
        () => {
          const text = document.getElementById("modal-remark-text").value.trim();
          if (!text) {
            alert("Wpisz treść uwagi.");
            return;
          }
          report.remarks[index] = { text };
          upsertReport(report);
          loadReportIntoForm(report, false);
          closeModal();
          refreshLists();
        }
      );
    }
  }
});

// Generowanie „PDF” – w wersji demo użyjemy okna drukowania
document.getElementById("generate-pdf-btn").addEventListener("click", () => {
  window.print();
});

// Zakończ obsługę
document.getElementById("finish-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  openConfirm(
    "Zamknięcie obsługi spowoduje ostateczne zapisanie danych, których nie będzie można poprawić. Czy chcesz zamknąć?",
    () => {
      report.status = "finished";
      upsertReport(report);
      loadReportIntoForm(report, true);
      refreshLists();
    }
  );
});

// Przekaż obsługę
document.getElementById("handover-btn").addEventListener("click", () => {
  const report = readReportFromForm();
  if (!report.general.trainNumber || !report.general.date) {
    alert("Podaj numer pociągu i dzień kursowania przed przekazaniem.");
    return;
  }
  report.status = "handed_over";
  upsertReport(report);
  loadReportIntoForm(report, false);
  refreshLists();
  alert("Pociąg został przekazany. Inny pracownik może go przejąć z menu głównego.");
});

// Odświeżanie list (Przejmij, Sprawdź, DyspoPanel)
function refreshLists() {
  const reports = loadReports();

  // Lista przejęcia
  const takeoverTbody = document.querySelector("#takeover-table tbody");
  if (takeoverTbody) {
    takeoverTbody.innerHTML = "";
    reports
      .filter((r) => r.status === "handed_over")
      .forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.general.trainNumber}</td>
          <td>${r.general.from} – ${r.general.to}</td>
          <td>${r.general.date}</td>
          <td>
            <button class="btn small" data-action="takeover" data-id="${r.id}">Przejmij</button>
          </td>
        `;
        takeoverTbody.appendChild(tr);
      });
  }

  // Lista do sprawdzenia (dziś i dzień poprzedni)
  const checkTbody = document.querySelector("#check-table tbody");
  if (checkTbody) {
    checkTbody.innerHTML = "";
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const dateToStr = (d) => d.toISOString().slice(0, 10);

    reports.forEach((r) => {
      if (!r.general.date) return;
      if (r.general.date === dateToStr(today) || r.general.date === dateToStr(yesterday)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.general.trainNumber}</td>
          <td>${r.general.from} – ${r.general.to}</td>
          <td>${r.general.date}</td>
          <td>
            <button class="btn small" data-action="preview" data-id="${r.id}">Podgląd</button>
          </td>
        `;
        checkTbody.appendChild(tr);
      }
    });
  }

  // DyspoPanel – aktualne raporty w trakcie (nie zakończone)
  const dyspoTbody = document.querySelector("#dyspo-table tbody");
  if (dyspoTbody) {
    dyspoTbody.innerHTML = "";
    reports
      .filter((r) => r.status !== "finished")
      .forEach((r) => {
        const lastRun = r.runs[r.runs.length - 1];
        const station = lastRun ? lastRun.station : "-";
        let delay = 0;
        if (lastRun) {
          const delayArr = calculateDelayMinutes(lastRun.plannedArr, lastRun.actualArr);
          const delayDep = calculateDelayMinutes(lastRun.plannedDep, lastRun.actualDep);
          // Bierzemy większe opóźnienie (jeśli jest)
          delay = (delayArr || 0);
          if (delayDep !== null && Math.abs(delayDep) > Math.abs(delay)) delay = delayDep;
        }

        const tr = document.createElement("tr");
        if (delay > 20) {
          tr.classList.add("row-critical-delay");
        }
        tr.innerHTML = `
          <td>${r.general.trainNumber}</td>
          <td>${r.general.from} – ${r.general.to}</td>
          <td>${station}</td>
          <td>${delay}</td>
        `;
        dyspoTbody.appendChild(tr);
      });
  }
}

// Kliknięcie „Przejmij” i „Podgląd” w listach
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  if (!action) return;

  const id = btn.getAttribute("data-id");
  const report = getReportById(id);
  if (!report) {
    alert("Nie znaleziono raportu.");
    return;
  }

  if (action === "takeover") {
    // Przejmij pociąg – zmieniamy status na in_progress
    report.status = "in_progress";
    upsertReport(report);
    loadReportIntoForm(report, false);
    showScreen("handle-train-screen");
    refreshLists();
  } else if (action === "preview") {
    // Tylko podgląd – tryb read-only
    loadReportIntoForm(report, true);
    showScreen("handle-train-screen");
  }
});

// DyspoPanel – automatyczne odświeżanie co 3 minuty
setInterval(() => {
  const activeDyspo = document.getElementById("dyspo-screen").classList.contains("active");
  if (activeDyspo) {
    refreshLists();
  }
}, 3 * 60 * 1000);

// Na starcie – nowy pusty raport
window.addEventListener("load", () => {
  const report = createEmptyReport();
  upsertReport(report);
  loadReportIntoForm(report, false);
});
