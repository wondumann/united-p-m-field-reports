const storageKey = "sdwmr-field-form-drafts";
const currentStateKey = "sdwmr-field-form-current";

const tableSchemas = {
  equipmentTable: [
    { name: "equipment", type: "text", placeholder: "Excavator, loader, truck" },
    { name: "unitId", type: "text", placeholder: "Unit # / asset ID" },
    { name: "operator", type: "text", placeholder: "Operator name" },
    { name: "checkItem", type: "select", options: ["Walk-around", "Leaks / fluids", "Brakes", "Lights / alarms", "Hydraulics", "PPE / guards", "Fire extinguisher", "Other"] },
    { name: "status", type: "select", options: ["Pass", "Needs Attention", "Out of Service"] },
    { name: "correctiveAction", type: "text", placeholder: "Action taken or required" },
    { name: "signOff", type: "text", placeholder: "Initials / signature" }
  ],
  signinTable: [
    { name: "name", type: "text", placeholder: "Full name" },
    { name: "company", type: "text", placeholder: "Company" },
    { name: "role", type: "text", placeholder: "Laborer, operator, PM" },
    { name: "start", type: "time" },
    { name: "end", type: "time" },
    { name: "signature", type: "text", placeholder: "Typed signature" }
  ],
  jarrJobStepTable: [
    { name: "jobStep", type: "text", placeholder: "Task step" },
    { name: "hazards", type: "text", placeholder: "Known or potential hazards" },
    { name: "controls", type: "text", placeholder: "Required controls" }
  ],
  jarrEmployeeTable: [
    { name: "employee", type: "text", placeholder: "Name and company" },
    { name: "signature", type: "text", placeholder: "Signature" },
    { name: "start", type: "text", placeholder: "Initials" },
    { name: "midDay", type: "text", placeholder: "Initials" },
    { name: "endOfShift", type: "text", placeholder: "Initials" }
  ]
};

const navItems = document.querySelectorAll(".nav-item");
const panels = document.querySelectorAll(".form-panel");
const fieldForm = document.querySelector("#fieldForm");
const draftList = document.querySelector("#draftList");
const toast = document.querySelector("#toast");

let activePanel = "daily";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#workDate").valueAsDate = new Date();
  addTableRow("equipmentTable");
  addTableRow("signinTable");
  addTableRow("jarrJobStepTable");
  addTableRow("jarrEmployeeTable");
  restoreCurrentState();
  bindEvents();
  renderDrafts();
});

function bindEvents() {
  navItems.forEach((item) => {
    item.addEventListener("click", () => switchPanel(item.dataset.form));
  });

  document.querySelectorAll("[data-add-row]").forEach((button) => {
    button.addEventListener("click", () => addTableRow(button.dataset.addRow));
  });

  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => exportTableCsv(button.dataset.export));
  });

  document.querySelector("#saveBtn").addEventListener("click", saveDraft);

  document.querySelector("#printBtn").addEventListener("click", () => window.print());

  document.querySelector("#submitBtn").addEventListener("click", async () => {
    const state = collectState();

    const success = await saveToGoogleSheets(state);

    if (success) {
      showToast("Report submitted successfully.");
    } else {
      showToast("Submission failed.");
    }
  });

  document.addEventListener("input", () => {
    localStorage.setItem(currentStateKey, JSON.stringify(collectState()));
  });
}

function switchPanel(panelName) {
  const resolvedPanel = panelName === "quantities" ? "equipment" : panelName;
  activePanel = resolvedPanel;
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.form === resolvedPanel));
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === resolvedPanel));
  if (resolvedPanel === "drafts") renderDrafts();
}

function addTableRow(tableId, values = {}) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  const tr = document.createElement("tr");

  tableSchemas[tableId].forEach((field) => {
    const td = document.createElement("td");
    const control = field.type === "select" ? document.createElement("select") : document.createElement("input");

    control.name = `${tableId}.${field.name}`;
    if (field.type !== "select") {
      control.type = field.type;
      if (field.placeholder) control.placeholder = field.placeholder;
    } else {
      field.options.forEach((optionText) => {
        const option = document.createElement("option");
        option.value = optionText;
        option.textContent = optionText;
        control.appendChild(option);
      });
    }

    if (Object.prototype.hasOwnProperty.call(values, field.name)) {
      control.value = values[field.name];
    }
    td.appendChild(control);
    tr.appendChild(td);
  });

  const actionCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "row-remove";
  removeButton.textContent = "X";
  removeButton.title = "Remove row";
  removeButton.setAttribute("aria-label", "Remove row");
  removeButton.addEventListener("click", () => {
    tr.remove();
    localStorage.setItem(currentStateKey, JSON.stringify(collectState()));
  });
  actionCell.appendChild(removeButton);
  tr.appendChild(actionCell);
  tbody.appendChild(tr);
}

function collectState() {
  const common = {};
  document.querySelectorAll(".project-strip input").forEach((input) => {
    common[input.id] = input.value;
  });

  const fields = {};
  new FormData(fieldForm).forEach((value, key) => {
    if (!isTableField(key)) {
      fields[key] = value;
    }
  });

  return {
    id: createId(),
    savedAt: new Date().toISOString(),
    activePanel,
    common,
    fields,
    tables: {
      equipmentTable: collectTable("equipmentTable"),
      signinTable: collectTable("signinTable"),
      jarrJobStepTable: collectTable("jarrJobStepTable"),
      jarrEmployeeTable: collectTable("jarrEmployeeTable")
    }
  };
}

function isTableField(key) {
  return Object.keys(tableSchemas).some((tableId) => key.includes(`${tableId}.`));
}

function collectTable(tableId) {
  const rows = [];
  document.querySelectorAll(`#${tableId} tbody tr`).forEach((tr) => {
    const row = {};
    tableSchemas[tableId].forEach((field) => {
      const control = tr.querySelector(`[name="${tableId}.${field.name}"]`);
      row[field.name] = control ? control.value : "";
    });
    const hasValue = tableSchemas[tableId].some((field) => {
      const value = row[field.name].trim();
      if (field.type === "select") return value !== "" && value !== field.options[0];
      return value !== "";
    });
    if (hasValue) rows.push(row);
  });
  return rows;
}

function applyState(state) {
  if (!state) return;

  fieldForm.reset();

  Object.entries(state.common || {}).forEach(([id, value]) => {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = value;
  });

  Object.entries(state.fields || {}).forEach(([name, value]) => {
    const controls = document.querySelectorAll(`[name="${name}"]`);
    controls.forEach((control) => {
      if (control.type === "radio" || control.type === "checkbox") {
        control.checked = control.value === value || value === "on";
      } else {
        control.value = value;
      }
    });
  });

  Object.keys(tableSchemas).forEach((tableId) => {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = "";
    const rows = state.tables?.[tableId] || [];
    if (rows.length === 0) {
      addTableRow(tableId);
    } else {
      rows.forEach((row) => addTableRow(tableId, row));
    }
  });

  switchPanel(state.activePanel || "daily");
}

function restoreCurrentState() {
  const raw = localStorage.getItem(currentStateKey);
  if (!raw) return;

  try {
    applyState(JSON.parse(raw));
  } catch {
    localStorage.removeItem(currentStateKey);
  }
}

function saveDraft() {
  const state = collectState();
  const drafts = getDrafts();
  const title = `${state.common.projectName || "Project"} - ${state.common.workDate || "No date"}`;
  drafts.unshift({ ...state, title });
  localStorage.setItem(storageKey, JSON.stringify(drafts.slice(0, 25)));
  renderDrafts();
  showToast("Draft saved.");
}

function getDrafts() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function renderDrafts() {
  const drafts = getDrafts();
  draftList.innerHTML = "";

  if (drafts.length === 0) {
    draftList.innerHTML = '<div class="empty-state">No saved drafts yet.</div>';
    return;
  }

  drafts.forEach((draft) => {
    const item = document.createElement("article");
    item.className = "draft-item";

    const details = document.createElement("div");
    details.innerHTML = `
      <p class="draft-title">${escapeHtml(draft.title)}</p>
      <p class="draft-meta">Saved ${new Date(draft.savedAt).toLocaleString()}</p>
    `;

    const loadButton = document.createElement("button");
    loadButton.className = "secondary-button";
    loadButton.type = "button";
    loadButton.textContent = "Load";
    loadButton.addEventListener("click", () => {
      applyState(draft);
      localStorage.setItem(currentStateKey, JSON.stringify(draft));
      showToast("Draft loaded.");
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteDraft(draft.id));

    item.append(details, loadButton, deleteButton);
    draftList.appendChild(item);
  });
}

function deleteDraft(id) {
  const drafts = getDrafts().filter((draft) => draft.id !== id);
  localStorage.setItem(storageKey, JSON.stringify(drafts));
  renderDrafts();
  showToast("Draft deleted.");
}

function exportTableCsv(tableId) {
  const rows = collectTable(tableId);
  if (rows.length === 0) {
    showToast("Add at least one completed row before exporting.");
    return;
  }

  const headers = tableSchemas[tableId].map((field) => field.name);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = document.querySelector("#workDate").value || "undated";
  link.href = url;
  link.download = `${tableId}-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV exported.");
}

function csvCell(value = "") {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
async function saveToGoogleSheets(state) {
  try {
    const formData = new FormData();

    formData.append(
      "data",
      JSON.stringify({
        project: state.common.projectName || "",
        supervisor: state.fields.supervisor || "",
        crewSize: state.tables.signinTable
          ? state.tables.signinTable.length
          : 0,
        hours: "",
        reportId: state.id,
        pdfLink: ""
      })
    );

    const response = await fetch(
      "https://script.google.com/macros/s/AKfycbwcdIQvGAV42sCenjPdq1Gk3RNDiLxQAzY-YI6erEIMoSFQ3aupnF8kYS-kbf2Kqv20TQ/exec",
      {
        method: "POST",
        body: formData
      }
    );

    const result = await response.text();

    console.log("Google Sheets:", result);

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
let toastTimeout;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
}
async function testGoogleSheets() {
  try {
    const formData = new FormData();

    formData.append(
      "data",
      JSON.stringify({
        test: "Connection Successful",
        timestamp: new Date().toISOString()
      })
    );

    await fetch(
      "https://script.google.com/macros/s/AKfycbwcdIQvGAV42sCenjPdq1Gk3RNDiLxQAzY-YI6erEIMoSFQ3aupnF8kYS-kbf2Kqv20TQ/exec",
      {
        method: "POST",
        mode: "no-cors",
        body: formData
      }
    );

    alert("Test submitted.");
  } catch (error) {
    console.error(error);
    alert("Test failed.");
  }
}
async function testGoogleSheets() {
  try {
    const formData = new FormData();

    formData.append(
      "data",
      JSON.stringify({
        test: "Connection Successful",
        timestamp: new Date().toISOString()
      })
    );

    await fetch(
      "https://script.google.com/macros/s/AKfycbwcdIQvGAV42sCenjPdq1Gk3RNDiLxQAzY-YI6erEIMoSFQ3aupnF8kYS-kbf2Kqv20TQ/exec",
      {
        method: "POST",
        mode: "no-cors",
        body: formData
      }
    );

    alert("Test submitted.");
  } catch (error) {
    console.error(error);
    alert("Test failed.");
  }
}
async function submitRealReport() {
  try {
    
    const pdfData =
      await generatePDFReport(true);

    const reportData = {
      project: document.querySelector("#projectName")?.value || "",
      workDate: document.querySelector("#workDate")?.value || "",
      supervisor: document.querySelector("#preparedBy")?.value || "",
      weather: document.querySelector("#weather")?.value || "",

      workArea:
        document.querySelector('[name="daily.workArea"]')?.value || "",

      crewCount:
        document.querySelector('[name="daily.crewCount"]')?.value || "",

      equipment:
        document.querySelector('[name="daily.equipment"]')?.value || "",

      workPerformed:
        document.querySelector('[name="daily.workPerformed"]')?.value || "",

      delays:
        document.querySelector('[name="daily.delays"]')?.value || "",

      visitors:
        document.querySelector('[name="daily.visitors"]')?.value || "",

      safetyTopic:
        document.querySelector('[name="safety.topic"]')?.value || "",

      safetyNotes:
        document.querySelector('[name="safety.notes"]')?.value || "",

      followup:
        document.querySelector('[name="safety.followup"]')?.value || "",

      pdfBase64: pdfData.base64,
      fileName: pdfData.fileName,

      reportId: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };

    const pdfData =
      await generatePDFReport(true);
    
    const formData = new FormData();

    formData.append(
      "data",
      JSON.stringify(reportData)
    );

    await fetch(
      "https://script.google.com/macros/s/AKfycbwcdIQvGAV42sCenjPdq1Gk3RNDiLxQAzY-YI6erEIMoSFQ3aupnF8kYS-kbf2Kqv20TQ/exec",
      {
        method: "POST",
        mode: "no-cors",
        body: formData
      }
    );

    alert("Report submitted successfully.");

  } catch (error) {

    console.error(error);

    alert("Submission failed.");
  }
}
async function generatePDFReport(returnBase64 = false) {

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF();

  const project =
    document.querySelector("#projectName")?.value || "";

  const workDate =
    document.querySelector("#workDate")?.value || "";

  const supervisor =
    document.querySelector("#preparedBy")?.value || "";

  const weather =
    document.querySelector("#weather")?.value || "";

  const workPerformed =
    document.querySelector('[name="daily.workPerformed"]')?.value || "";

  const safetyNotes =
    document.querySelector('[name="safety.notes"]')?.value || "";

  doc.setFontSize(18);

  doc.text("United P&M Daily Field Report", 20, 20);

  doc.setFontSize(12);

  doc.text(`Project: ${project}`, 20, 40);
  doc.text(`Date: ${workDate}`, 20, 50);
  doc.text(`Supervisor: ${supervisor}`, 20, 60);
  doc.text(`Weather: ${weather}`, 20, 70);

  doc.text("Work Performed:", 20, 90);

  doc.text(workPerformed || "-", 20, 100, {
    maxWidth: 170
  });

  doc.text("Safety Notes:", 20, 140);

  doc.text(safetyNotes || "-", 20, 150, {
    maxWidth: 170
  });

  const fileName =
    `Field_Report_${project}_${workDate}.pdf`;

  if (returnBase64) {

    const base64 =
      doc.output("datauristring")
        .split(",")[1];

    return {
      base64,
      fileName
    };
  }

  doc.save(fileName);
}
