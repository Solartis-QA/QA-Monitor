const STORAGE_KEY = "qaMonitorData";

function loadData() {
  let data = { automation: {}, manualProjects: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { /* ignore corrupt storage */ }

  if (!data.manualProjects) data.manualProjects = {};

  // Migrate older schema where projects were nested per-date (data.manual[date][project])
  // into a flat, date-independent list: data.manualProjects[project]. Entries from every
  // date the project appeared under are merged together.
  if (data.manual) {
    Object.values(data.manual).forEach(projects => {
      Object.keys(projects).forEach(name => {
        const old = projects[name];
        const oldEntries = Array.isArray(old) ? old : (old.entries || []);
        const oldExcel = Array.isArray(old) ? null : old.excelSheet;
        if (!data.manualProjects[name]) data.manualProjects[name] = { entries: [], excelSheet: null };
        data.manualProjects[name].entries.push(...oldEntries);
        if (oldExcel && !data.manualProjects[name].excelSheet) {
          data.manualProjects[name].excelSheet = oldExcel;
        }
      });
    });
    delete data.manual;
  }
  return data;
}

function getManualProject(name) {
  if (!DATA.manualProjects[name]) DATA.manualProjects[name] = { entries: [], excelSheet: null };
  return DATA.manualProjects[name];
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

const DATA = loadData();

const state = {
  screen: "home",
  autoDate: todayStr(),
  manualProject: null
};

function todayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function statusClass(status) {
  switch ((status || "").toLowerCase()) {
    case "completed": return "status-completed";
    case "in progress": return "status-in-progress";
    case "blocked": return "status-blocked";
    default: return "status-default";
  }
}

// ---- Pending ETA: the planned duration between Start and Expected End (full date + time).
// Deterministic — never entered manually, never depends on the current clock.
// Formats as minutes / hours / days / weeks / months depending on magnitude.
function formatDuration(ms) {
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;
  const units = [["y", YEAR], ["mo", MONTH], ["w", WEEK], ["d", DAY], ["h", HOUR], ["m", MIN]];
  let remaining = ms;
  const parts = [];
  for (const [label, unitMs] of units) {
    if (remaining >= unitMs) {
      const val = Math.floor(remaining / unitMs);
      parts.push(`${val}${label}`);
      remaining -= val * unitMs;
      if (parts.length === 2) break;
    }
  }
  return parts.length ? parts.join(" ") : "0m";
}

function computePendingEta(entry) {
  if ((entry.status || "").toLowerCase() === "completed") {
    return { text: "-", cls: "eta-dash" };
  }
  if (!entry.endTime || entry.endTime === "-" || !entry.startTime || entry.startTime === "-") {
    return { text: "-", cls: "eta-dash" };
  }
  const start = new Date(entry.startTime);
  const end = new Date(entry.endTime);
  if (isNaN(start) || isNaN(end)) return { text: "-", cls: "eta-dash" };

  const diffMs = end - start;
  if (diffMs <= 0) return { text: "-", cls: "eta-dash" };

  return { text: formatDuration(diffMs), cls: "eta-countdown" };
}

function formatDateTime(value) {
  if (!value || value === "-") return "-";
  const d = new Date(value);
  if (isNaN(d)) return "-";
  return d.toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H8.7a2 2 0 0 1-2-1.9L6 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function renderTable(rows, opts) {
  const showProjectCol = !!(opts && opts.showProject);
  if (!rows || rows.length === 0) {
    return `<div class="empty-state">No entries yet. Use "Add Employee Entry" to add one.</div>`;
  }
  const cols = ["Employee"];
  if (showProjectCol) cols.push("Project");
  cols.push("Module", "Start", "Expected End", "Pending ETA", "Status", "");

  const head = cols.map(c => `<th>${c}</th>`).join("");
  const body = rows.map((r, i) => {
    const eta = computePendingEta(r);
    const cells = [`<td><div class="emp-cell"><span class="emp-avatar">${escapeHtml(initials(r.employee))}</span><span class="emp-name">${escapeHtml(r.employee)}</span></div></td>`];
    if (showProjectCol) cells.push(`<td>${escapeHtml(r.project)}</td>`);
    cells.push(
      `<td>${escapeHtml(r.module)}</td>`,
      `<td>${escapeHtml(formatDateTime(r.startTime))}</td>`,
      `<td>${escapeHtml(formatDateTime(r.endTime))}</td>`,
      `<td class="eta-cell ${eta.cls}">${eta.text}</td>`,
      `<td><span class="status-pill ${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>`,
      `<td><button type="button" class="delete-btn" data-index="${i}" title="Delete entry" aria-label="Delete entry for ${escapeHtml(r.employee)}">${TRASH_ICON}</button></td>`
    );
    return `<tr>${cells.join("")}</tr>`;
  }).join("");

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ---- Toast ----
const toastEl = document.getElementById("toast");
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  requestAnimationFrame(() => toastEl.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
    setTimeout(() => toastEl.classList.add("hidden"), 250);
  }, 2200);
}

// ---- Live clock ----
const liveClockEl = document.getElementById("liveClock");
function tickClock() {
  const now = new Date();
  liveClockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
tickClock();
setInterval(tickClock, 1000);

// ---- Screen elements ----
const screens = {
  home: document.getElementById("screen-home"),
  automation: document.getElementById("screen-automation"),
  manual: document.getElementById("screen-manual"),
  manualProject: document.getElementById("screen-manual-project")
};
const backBtn = document.getElementById("backBtn");

function showScreen(name) {
  state.screen = name;
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  backBtn.classList.toggle("hidden", name === "home");
}

// ---- Automation screen ----
const autoDateInput = document.getElementById("autoDate");
const autoTableWrap = document.getElementById("autoTableWrap");

function renderAutomation() {
  const rows = DATA.automation[state.autoDate] || [];
  autoTableWrap.innerHTML = renderTable(rows, { showProject: true });
}

autoDateInput.addEventListener("change", () => {
  state.autoDate = autoDateInput.value || todayStr();
  renderAutomation();
});

autoTableWrap.addEventListener("click", e => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  const rows = DATA.automation[state.autoDate] || [];
  const entry = rows[idx];
  if (!entry) return;
  if (!confirm(`Delete entry for ${entry.employee}?`)) return;
  rows.splice(idx, 1);
  saveData();
  renderAutomation();
  showToast(`Entry for ${entry.employee} deleted`);
});

// ---- Manual screen: project list (global — every project shows regardless of date) ----
const projectList = document.getElementById("projectList");

function renderProjectList() {
  const projects = DATA.manualProjects;
  const names = Object.keys(projects);
  if (names.length === 0) {
    projectList.innerHTML = `<div class="empty-state">No projects yet. Use "Add Project" to add one.</div>`;
    return;
  }
  projectList.innerHTML = names.map(name => {
    const count = (projects[name].entries || []).length;
    return `
    <div class="project-card" data-project="${escapeHtml(name)}" tabindex="0" role="button">
      <button type="button" class="delete-project-btn" data-project="${escapeHtml(name)}" title="Delete project" aria-label="Delete project ${escapeHtml(name)}">${TRASH_ICON}</button>
      <div class="p-name">${escapeHtml(name)}</div>
      <div class="p-count">${count} employee${count === 1 ? "" : "s"}</div>
    </div>
  `;
  }).join("");
}

projectList.addEventListener("click", e => {
  const delBtn = e.target.closest(".delete-project-btn");
  if (delBtn) {
    const name = delBtn.dataset.project;
    if (!confirm(`Delete project "${name}" and all its entries?`)) return;
    delete DATA.manualProjects[name];
    saveData();
    renderProjectList();
    showToast(`Project "${name}" deleted`);
    return;
  }
  const card = e.target.closest(".project-card");
  if (!card) return;
  state.manualProject = card.dataset.project;
  renderManualProjectDetail();
  showScreen("manualProject");
});

// ---- Manual screen: project detail ----
const manualTableWrap = document.getElementById("manualTableWrap");
const excelSheetWrap = document.getElementById("excelSheetWrap");
const projectNameLabel = document.getElementById("projectNameLabel");

const EXCEL_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l6 6M15 12l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function renderExcelSheet(sheet) {
  if (!sheet || !sheet.rows) return "";
  const rows = sheet.rows;
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const table = rows.length === 0
    ? `<div class="empty-state">Sheet "${escapeHtml(sheet.name)}" has no rows.</div>`
    : `<div class="excel-card-body"><table><thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(r => `<tr>${columns.map(c => `<td>${escapeHtml(r[c])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`;

  return `<div class="excel-card">
    <div class="excel-card-head">
      <span class="excel-icon">${EXCEL_ICON}</span>
      <span class="excel-title">${escapeHtml(sheet.name)}</span>
      <span class="excel-meta">${rows.length} row${rows.length === 1 ? "" : "s"}</span>
      <button type="button" class="remove-excel-btn" id="removeExcelBtn">Remove</button>
    </div>
    ${table}
  </div>`;
}

function renderManualProjectDetail() {
  const proj = getManualProject(state.manualProject);
  projectNameLabel.textContent = state.manualProject;
  excelSheetWrap.innerHTML = renderExcelSheet(proj.excelSheet);
  manualTableWrap.innerHTML = renderTable(proj.entries, { showProject: false });
}

manualTableWrap.addEventListener("click", e => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  const proj = getManualProject(state.manualProject);
  const entry = proj.entries[idx];
  if (!entry) return;
  if (!confirm(`Delete entry for ${entry.employee}?`)) return;
  proj.entries.splice(idx, 1);
  saveData();
  renderManualProjectDetail();
  showToast(`Entry for ${entry.employee} deleted`);
});

excelSheetWrap.addEventListener("click", e => {
  if (!e.target.closest("#removeExcelBtn")) return;
  if (!confirm(`Remove the uploaded sheet from ${state.manualProject}?`)) return;
  const proj = getManualProject(state.manualProject);
  proj.excelSheet = null;
  saveData();
  renderManualProjectDetail();
  showToast("Uploaded sheet removed");
});

// ==================== Excel upload (Tickets_Status sheet) ====================
const REQUIRED_SHEET_NAME = "Tickets_Status";
const excelFileInput = document.getElementById("excelFileInput");

document.getElementById("uploadExcelBtn").addEventListener("click", () => excelFileInput.click());

excelFileInput.addEventListener("change", () => {
  const file = excelFileInput.files[0];
  excelFileInput.value = ""; // allow re-uploading the same file later
  if (!file) return;

  if (typeof XLSX === "undefined") {
    showToast("Excel library failed to load — check your internet connection");
    return;
  }

  const reader = new FileReader();
  reader.onload = evt => {
    let workbook;
    try {
      workbook = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
    } catch (err) {
      showToast("Couldn't read that file — is it a valid Excel workbook?");
      return;
    }
    if (!workbook.SheetNames.includes(REQUIRED_SHEET_NAME)) {
      showToast(`Sheet "${REQUIRED_SHEET_NAME}" not found in this file`);
      return;
    }
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[REQUIRED_SHEET_NAME], { defval: "" });
    const proj = getManualProject(state.manualProject);
    proj.excelSheet = { name: REQUIRED_SHEET_NAME, rows: json };
    saveData();
    renderManualProjectDetail();
    showToast(`"${REQUIRED_SHEET_NAME}" uploaded (${json.length} row${json.length === 1 ? "" : "s"})`);
  };
  reader.onerror = () => showToast("Failed to read the file");
  reader.readAsArrayBuffer(file);
});

// ---- Mode selection ----
document.querySelectorAll(".mode-card").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (mode === "automation") {
      autoDateInput.value = state.autoDate;
      renderAutomation();
      showScreen("automation");
    } else if (mode === "manual") {
      renderProjectList();
      showScreen("manual");
    }
  });
});

// ---- Back navigation ----
backBtn.addEventListener("click", () => {
  if (state.screen === "manualProject") {
    showScreen("manual");
  } else {
    showScreen("home");
  }
});

// ==================== Add Employee Entry modal ====================
const entryModalOverlay = document.getElementById("entryModalOverlay");
const entryModalTitle = document.getElementById("entryModalTitle");
const entryForm = document.getElementById("entryForm");
const fProjectWrap = document.getElementById("f-project-wrap");
const fEmployee = document.getElementById("f-employee");
const fProject = document.getElementById("f-project");
const fModule = document.getElementById("f-module");
const fStart = document.getElementById("f-start");
const fEnd = document.getElementById("f-end");
const fStatus = document.getElementById("f-status");

let entryContext = null; // "automation" | "manual"

function openEntryModal(context) {
  entryContext = context;
  entryForm.reset();
  if (context === "automation") {
    entryModalTitle.textContent = "Add Employee Entry — Automation";
    fProjectWrap.classList.remove("hidden");
    fProject.required = true;
  } else {
    entryModalTitle.textContent = `Add Employee Entry — ${state.manualProject}`;
    fProjectWrap.classList.add("hidden");
    fProject.required = false;
  }
  entryModalOverlay.classList.remove("hidden");
  fEmployee.focus();
}

function closeEntryModal() {
  entryModalOverlay.classList.add("hidden");
  entryContext = null;
}

document.getElementById("addAutoEntryBtn").addEventListener("click", () => openEntryModal("automation"));
document.getElementById("addManualEntryBtn").addEventListener("click", () => openEntryModal("manual"));
document.getElementById("entryModalCancel").addEventListener("click", closeEntryModal);
entryModalOverlay.addEventListener("click", e => {
  if (e.target === entryModalOverlay) closeEntryModal();
});

entryForm.addEventListener("submit", e => {
  e.preventDefault();
  const entry = {
    employee: fEmployee.value.trim(),
    module: fModule.value.trim(),
    startTime: fStart.value || "-",
    endTime: fEnd.value || "-",
    status: fStatus.value
  };
  if (!entry.employee || !entry.module) return;

  if (entryContext === "automation") {
    entry.project = fProject.value.trim() || "Unassigned";
    if (!DATA.automation[state.autoDate]) DATA.automation[state.autoDate] = [];
    DATA.automation[state.autoDate].push(entry);
    saveData();
    renderAutomation();
  } else if (entryContext === "manual") {
    const proj = getManualProject(state.manualProject);
    proj.entries.push(entry);
    saveData();
    renderManualProjectDetail();
  }
  closeEntryModal();
  showToast(`Entry added for ${entry.employee}`);
});

// ==================== Add Project modal ====================
const projectModalOverlay = document.getElementById("projectModalOverlay");
const projectForm = document.getElementById("projectForm");
const fNewProject = document.getElementById("f-new-project");

function openProjectModal() {
  projectForm.reset();
  projectModalOverlay.classList.remove("hidden");
  fNewProject.focus();
}

function closeProjectModal() {
  projectModalOverlay.classList.add("hidden");
}

document.getElementById("addProjectBtn").addEventListener("click", openProjectModal);
document.getElementById("projectModalCancel").addEventListener("click", closeProjectModal);
projectModalOverlay.addEventListener("click", e => {
  if (e.target === projectModalOverlay) closeProjectModal();
});

projectForm.addEventListener("submit", e => {
  e.preventDefault();
  const name = fNewProject.value.trim();
  if (!name) return;
  getManualProject(name);
  saveData();
  renderProjectList();
  closeProjectModal();
  showToast(`Project "${name}" added`);
});

// ---- Init ----
showScreen("home");
