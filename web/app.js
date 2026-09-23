/**
 * TigerGraph Sentinel | Web Analyst Dashboard Controller
 * Interactive Force-Directed Canvas Graph, Real-Time Case Progression,
 * NBA Simulation, and FinCEN SAR Narrative Inspector.
 */

let allCases = [];
let currentCase = null;
let currentCaseId = "HHG-001";
let graphSimulation = null;

// DOM Elements
const caseListContainer = document.getElementById("caseListContainer");
const caseSearchInput = document.getElementById("caseSearchInput");
const filterChips = document.querySelectorAll(".filter-chips .chip");

// Header elements
const currentCaseIdBadge = document.getElementById("currentCaseIdBadge");
const currentStatusBadge = document.getElementById("currentStatusBadge");
const currentPatternBadge = document.getElementById("currentPatternBadge");
const triggerTypeLabel = document.getElementById("triggerTypeLabel");
const triggerTextContent = document.getElementById("triggerTextContent");

// KPIs
const kpiRiskScore = document.getElementById("kpiRiskScore");
const kpiFraudProb = document.getElementById("kpiFraudProb");
const kpiExposure = document.getElementById("kpiExposure");
const kpiTxnCount = document.getElementById("kpiTxnCount");
const kpiRingSize = document.getElementById("kpiRingSize");
const kpiDeviceName = document.getElementById("kpiDeviceName");

// Evidence & Memory
const evidenceListContainer = document.getElementById("evidenceListContainer");
const evidenceCountBadge = document.getElementById("evidenceCountBadge");
const memoryChipsContainer = document.getElementById("memoryChipsContainer");

// NBA Elements
const initialActionsList = document.getElementById("initialActionsList");
const finalActionsList = document.getElementById("finalActionsList");
const simActionType = document.getElementById("simActionType");
const simResponseText = document.getElementById("simResponseText");
const whatChangedText = document.getElementById("whatChangedText");
const btnSimDeny = document.getElementById("btnSimDeny");
const btnSimConfirm = document.getElementById("btnSimConfirm");

// SAR Elements
const sarStatusPill = document.getElementById("sarStatusPill");
const sarFilingStatus = document.getElementById("sarFilingStatus");
const sarFilingReason = document.getElementById("sarFilingReason");
const sarTotalAmount = document.getElementById("sarTotalAmount");
const sarActivityDates = document.getElementById("sarActivityDates");
const sarSubjectChips = document.getElementById("sarSubjectChips");
const sarNarrativeContent = document.getElementById("sarNarrativeContent");
const btnCopyNarrative = document.getElementById("btnCopyNarrative");

// Audit Footer
const auditGraphWritten = document.getElementById("auditGraphWritten");
const auditToolCalls = document.getElementById("auditToolCalls");
const auditTokens = document.getElementById("auditTokens");
const auditLatency = document.getElementById("auditLatency");
const auditStopReason = document.getElementById("auditStopReason");

// Graph Canvas
const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");
let graphNodes = [];
let graphEdges = [];
let draggingNode = null;
let hoveredNode = null;
let graphScale = 1.0;
let graphOffsetX = 0;
let graphOffsetY = 0;

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", async () => {
  setupCanvas();
  setupEventListeners();
  await loadCases();
});

function setupEventListeners() {
  caseSearchInput.addEventListener("input", filterCases);

  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      filterCases();
    });
  });

  btnCopyNarrative.addEventListener("click", () => {
    if (sarNarrativeContent.innerText) {
      navigator.clipboard.writeText(sarNarrativeContent.innerText);
      const originalText = btnCopyNarrative.innerText;
      btnCopyNarrative.innerText = "Copied!";
      setTimeout(() => btnCopyNarrative.innerText = originalText, 1500);
    }
  });

  btnSimDeny.addEventListener("click", () => simulateCustomerReply("denied"));
  btnSimConfirm.addEventListener("click", () => simulateCustomerReply("confirmed"));

  document.getElementById("btnExportJson").addEventListener("click", () => {
    if (!currentCase) return;
    const blob = new Blob([JSON.stringify(currentCase, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentCase.case_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btnResetGraph").addEventListener("click", () => {
    graphScale = 1.0;
    graphOffsetX = 0;
    graphOffsetY = 0;
    initGraphData(currentCase);
  });

  document.getElementById("btnZoomIn").addEventListener("click", () => {
    graphScale = Math.min(2.5, graphScale * 1.2);
  });

  document.getElementById("btnZoomOut").addEventListener("click", () => {
    graphScale = Math.max(0.4, graphScale / 1.2);
  });
}

async function loadCases() {
  try {
    const res = await fetch("/api/cases");
    if (!res.ok) throw new Error("Failed to load cases from server");
    allCases = await res.json();
    renderCaseList(allCases);
    if (allCases.length > 0) {
      selectCase(allCases[0].case_id);
    }
  } catch (err) {
    console.warn("Could not fetch /api/cases, loading fallback preview...", err);
    loadMockPreview();
  }
}

function renderCaseList(cases) {
  caseListContainer.innerHTML = "";
  cases.forEach(c => {
    const card = document.createElement("div");
    card.className = `case-card-item ${c.case_id === currentCaseId ? "selected" : ""}`;
    card.onclick = () => selectCase(c.case_id);

    const verdict = c.case?.verdict || "fraud";
    const pattern = c.case?.pattern || "none";
    const sarFiled = c.sar?.file ? "SAR" : "";
    const exposure = c.case?.exposure_usd || 0;

    card.innerHTML = `
      <div class="case-item-header">
        <span class="case-item-id">${c.case_id}</span>
        <span class="verdict-tag ${verdict}">${verdict}</span>
      </div>
      <div class="case-item-meta">
        <span class="trigger-chip">${pattern.replace(/_/g, ' ')}</span>
        <span class="sar-indicator">${sarFiled ? "⚠️ SAR" : `$${exposure.toFixed(0)}`}</span>
      </div>
    `;
    caseListContainer.appendChild(card);
  });
}

function filterCases() {
  const query = caseSearchInput.value.toLowerCase();
  const activeChip = document.querySelector(".filter-chips .chip.active")?.dataset.filter || "all";

  const filtered = allCases.filter(c => {
    const cid = c.case_id.toLowerCase();
    const verdict = (c.case?.verdict || "").toLowerCase();
    const pattern = (c.case?.pattern || "").toLowerCase();
    const matchesQuery = cid.includes(query) || pattern.includes(query) || verdict.includes(query);

    if (!matchesQuery) return false;

    if (activeChip === "all") return true;
    if (activeChip === "fraud") return verdict === "fraud";
    if (activeChip === "legitimate") return verdict === "legitimate";
    if (activeChip === "sar") return c.sar?.file === true;

    return true;
  });

  renderCaseList(filtered);
}

async function selectCase(caseId) {
  currentCaseId = caseId;
  document.querySelectorAll(".case-card-item").forEach(card => {
    const idSpan = card.querySelector(".case-item-id");
    if (idSpan && idSpan.innerText === caseId) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });

  try {
    const res = await fetch(`/api/case/${caseId}`);
    if (res.ok) {
      currentCase = await res.json();
    } else {
      currentCase = allCases.find(c => c.case_id === caseId);
    }
  } catch (err) {
    currentCase = allCases.find(c => c.case_id === caseId);
  }

  if (currentCase) {
    displayCaseDetails(currentCase);
    initGraphData(currentCase);
  }
}

function displayCaseDetails(data) {
  const c = data.case;
  currentCaseIdBadge.innerText = data.case_id;

  const verdict = c.verdict || "fraud";
  currentStatusBadge.innerText = (c.status || "CLOSED").toUpperCase().replace(/_/g, ' ');
  currentStatusBadge.className = `status-badge ${verdict}`;

  currentPatternBadge.innerText = (c.pattern || "none").replace(/_/g, ' ').toUpperCase();

  // Trigger
  const triggerType = data.trigger_type || (data.evidence && data.evidence[0]?.claim.includes("customer_report") ? "CUSTOMER REPORT" : "RISK SCORE TRIGGER");
  triggerTypeLabel.innerText = triggerType.toUpperCase();
  triggerTextContent.innerText = data.evidence?.[0]?.claim || "Alert flagged for anomalous activity.";

  // KPIs
  kpiRiskScore.innerText = (data.risk_score !== undefined ? data.risk_score : 0.61).toFixed(2);
  kpiFraudProb.innerText = `${Math.round((c.fraud_probability || 0.85) * 100)}%`;
  kpiExposure.innerText = `$${(c.exposure_usd || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  kpiTxnCount.innerText = `${c.affected_txn_ids?.length || 0} affected txn(s)`;

  const ringCount = c.connected_card_ids?.length || 0;
  kpiRingSize.innerText = `${ringCount} Card${ringCount !== 1 ? 's' : ''}`;
  kpiDeviceName.innerText = c.connected_device_profiles?.[0]?.split('|')?.[0]?.trim() || "Isolated Account";

  // Evidence List
  evidenceListContainer.innerHTML = "";
  (c.evidence || []).forEach(ev => {
    const item = document.createElement("div");
    item.className = "evidence-item";
    item.innerHTML = `
      <div class="evidence-source-tag">[SOURCE: ${ev.source}]</div>
      <div class="evidence-claim">${ev.claim}</div>
      <div class="evidence-ref">${ev.ref}</div>
    `;
    evidenceListContainer.appendChild(item);
  });
  evidenceCountBadge.innerText = `${c.evidence?.length || 0} Findings`;

  // Memory Chips
  memoryChipsContainer.innerHTML = "";
  (c.similar_prior_cases || []).forEach(cid => {
    const chip = document.createElement("span");
    chip.className = "memory-chip-pill";
    chip.innerText = cid;
    chip.title = `Click to inspect precedent case ${cid}`;
    memoryChipsContainer.appendChild(chip);
  });
  if (!c.similar_prior_cases || c.similar_prior_cases.length === 0) {
    memoryChipsContainer.innerHTML = "<span class='text-dim'>No direct historical precedent cited.</span>";
  }

  // Next-Best Actions
  renderActionList(initialActionsList, data.next_best_actions?.initial || []);
  renderActionList(finalActionsList, data.next_best_actions?.final || []);

  const evReq = data.evidence_requests?.[0];
  if (evReq) {
    simActionType.innerText = evReq.type.replace(/_/g, ' ').toUpperCase();
    simResponseText.innerText = `"${evReq.assumed_response}"`;
  } else {
    simActionType.innerText = "No Additional Evidence Needed";
    simResponseText.innerText = "Direct evidence was sufficient to proceed.";
  }

  whatChangedText.innerText = data.next_best_actions?.what_changed || "No modifications between initial and final review.";

  // SAR
  const sar = data.sar || {};
  if (sar.file) {
    sarStatusPill.innerText = "REQUIRED (L2 APPROVAL)";
    sarStatusPill.className = "sar-status-pill";
    sarFilingStatus.innerText = "Mandatory Regulatory Filing";
    sarFilingReason.innerText = sar.reason || "Policy threshold exceeded";
    sarTotalAmount.innerText = `$${(sar.total_amount_usd || 0).toLocaleString(undefined, {minimumFractionDigits: 2})} USD`;
    sarActivityDates.innerText = sar.activity_dates ? `${sar.activity_dates[0]} to ${sar.activity_dates[1]}` : "N/A";

    sarSubjectChips.innerHTML = "";
    (sar.subjects || []).forEach(subj => {
      const chip = document.createElement("span");
      chip.className = "subject-chip";
      chip.innerText = subj;
      sarSubjectChips.appendChild(chip);
    });

    sarNarrativeContent.innerText = sar.narrative || "No narrative generated.";
  } else {
    sarStatusPill.innerText = "NOT REQUIRED";
    sarStatusPill.className = "sar-status-pill not-required";
    sarFilingStatus.innerText = "Exempt from Regulatory SAR";
    sarFilingReason.innerText = sar.reason || "Isolated low-exposure event or cleared false alarm.";
    sarTotalAmount.innerText = "$0.00 USD";
    sarActivityDates.innerText = "None";
    sarSubjectChips.innerHTML = "<span class='text-dim'>None</span>";
    sarNarrativeContent.innerText = "No Suspicious Activity Report required under institutional policy.";
  }

  // Audit Footer
  auditGraphWritten.innerHTML = c.written_to_graph
    ? `&#x2714; Ingested in Graph (${c.graph_case_id || 'TG-CASE'})`
    : "&#x2717; Pending Writeback";
  auditToolCalls.innerText = `${data.tool_calls || 5} GSQL calls`;
  auditTokens.innerText = `${(data.tokens || 5000).toLocaleString()} tokens`;
  auditLatency.innerText = `${data.latency_s || 0.3}s`;
  auditStopReason.innerText = data.stop_reason || "Defensible decision reached.";
}

function renderActionList(container, actions) {
  container.innerHTML = "";
  actions.forEach(a => {
    const row = document.createElement("div");
    row.className = "action-item-row";
    row.innerHTML = `
      <div class="action-name-group">
        <span class="action-name">${a.action}</span>
        <span class="action-reason">${a.reason}</span>
      </div>
      <span class="tag tag-${(a.route || 'auto').toLowerCase()}">${a.route}</span>
    `;
    container.appendChild(row);
  });
}

function simulateCustomerReply(type) {
  if (type === "denied") {
    btnSimDeny.classList.add("active");
    btnSimConfirm.classList.remove("active");
    simResponseText.innerText = '"Customer confirmed they still possess the card and explicitly denied authorizing the transaction."';
    // Re-render final actions as block
    if (currentCase) {
      currentCase.case.verdict = "fraud";
      currentCase.case.status = "closed_fraud";
      currentCase.case.fraud_probability = 0.88;
      displayCaseDetails(currentCase);
    }
  } else {
    btnSimConfirm.classList.add("active");
    btnSimDeny.classList.remove("active");
    simResponseText.innerText = '"Cardholder confirmed initiating the purchase; alert resolved as legitimate false alarm."';
    // Re-render final actions as close_no_fraud
    if (currentCase) {
      currentCase.case.verdict = "legitimate";
      currentCase.case.status = "closed_legitimate";
      currentCase.case.fraud_probability = 0.08;
      currentCase.case.exposure_usd = 0.0;
      currentCase.case.affected_txn_ids = [];
      currentCase.sar.file = false;
      currentCase.sar.narrative = "";
      currentCase.next_best_actions.final = [
        { action: "ALLOW_TRANSACTION", route: "auto", reason: "R3: Customer confirmed transaction as legitimate" },
        { action: "CLOSE_NO_FRAUD", route: "auto", reason: "R3: Cardholder confirmed activity; alert closed as false alarm" }
      ];
      currentCase.next_best_actions.what_changed = "Customer verified transaction. Actions updated to ALLOW_TRANSACTION and CLOSE_NO_FRAUD.";
      displayCaseDetails(currentCase);
    }
  }
}

/* ------------------------------------------------------------------------------
   Force-Directed Canvas Graph Visualizer
   ------------------------------------------------------------------------------ */
function setupCanvas() {
  const resize = () => {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  };
  window.addEventListener("resize", resize);
  resize();

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);

  requestAnimationFrame(graphAnimationLoop);
}

function initGraphData(data) {
  if (!data) return;
  const c = data.case;
  const cardId = data.card_id || (c.evidence?.[0]?.claim.match(/C\d+-K\d+/)?.[0]) || "Target-Card";
  const customerId = data.customer_id || cardId.split('-')[0] || "Target-Customer";
  const flaggedTid = c.first_suspicious_txn_id || "Flagged-Txn";
  const devProfile = c.connected_device_profiles?.[0] || "Mobile Safari 11.0";
  const connectedCards = c.connected_card_ids || [];

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  graphNodes = [
    { id: customerId, label: customerId, type: "customer", x: cx - 140, y: cy - 60, vx: 0, vy: 0, r: 18, color: "#3B82F6" },
    { id: cardId, label: cardId, type: "card", x: cx - 50, y: cy, vx: 0, vy: 0, r: 20, color: "#10B981" },
    { id: flaggedTid, label: `Txn ${flaggedTid}`, type: "txn", x: cx + 60, y: cy - 40, vx: 0, vy: 0, r: 16, color: "#EF4444" },
    { id: "dev-01", label: devProfile.split('|')[0].trim().substring(0, 16), type: "device", x: cx + 160, y: cy + 30, vx: 0, vy: 0, r: 18, color: "#A855F7" }
  ];

  graphEdges = [
    { from: customerId, to: cardId, label: "OWNS" },
    { from: cardId, to: flaggedTid, label: "MADE" },
    { from: flaggedTid, to: "dev-01", label: "FROM_DEVICE" }
  ];

  // Add connected ring cards
  connectedCards.slice(0, 3).forEach((cc, i) => {
    const angle = (i * Math.PI) / 3 + 0.5;
    const nx = cx + 220 + Math.cos(angle) * 70;
    const ny = cy + Math.sin(angle) * 70;
    graphNodes.push({ id: cc, label: cc, type: "ring", x: nx, y: ny, vx: 0, vy: 0, r: 15, color: "#F59E0B" });
    graphEdges.push({ from: "dev-01", to: cc, label: "SHARED_BY" });
  });

  // Add past case node
  if (c.similar_prior_cases?.[0]) {
    const pastCase = c.similar_prior_cases[0];
    graphNodes.push({ id: pastCase, label: pastCase, type: "memory", x: cx - 120, y: cy + 100, vx: 0, vy: 0, r: 14, color: "#EC4899" });
    graphEdges.push({ from: pastCase, to: cardId, label: "PRECEDENT" });
  }
}

function graphAnimationLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(graphOffsetX, graphOffsetY);
  ctx.scale(graphScale, graphScale);

  // Draw Edges
  graphEdges.forEach(e => {
    const source = graphNodes.find(n => n.id === e.from);
    const target = graphNodes.find(n => n.id === e.to);
    if (!source || !target) return;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    // Edge Label
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "9px JetBrains Mono";
    ctx.textAlign = "center";
    ctx.fillText(e.label, midX, midY - 4);
  });

  // Draw Nodes
  graphNodes.forEach(node => {
    // Outer glow
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2);
    ctx.fillStyle = `${node.color}33`;
    ctx.fill();

    // Inner circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Node text
    ctx.fillStyle = "#fff";
    ctx.font = "10px Inter";
    ctx.textAlign = "center";
    ctx.fillText(node.label, node.x, node.y + node.r + 14);
  });

  ctx.restore();
  requestAnimationFrame(graphAnimationLoop);
}

function onMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left - graphOffsetX) / graphScale;
  const my = (e.clientY - rect.top - graphOffsetY) / graphScale;

  for (let n of graphNodes) {
    const dist = Math.hypot(n.x - mx, n.y - my);
    if (dist <= n.r) {
      draggingNode = n;
      break;
    }
  }
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left - graphOffsetX) / graphScale;
  const my = (e.clientY - rect.top - graphOffsetY) / graphScale;

  if (draggingNode) {
    draggingNode.x = mx;
    draggingNode.y = my;
  }
}

function onMouseUp() {
  draggingNode = null;
}

function loadMockPreview() {
  // If backend is booting, render sample preview
  allCases = [
    {
      case_id: "HHG-001",
      trigger_type: "risk_score",
      risk_score: 0.61,
      case: {
        status: "closed_fraud",
        verdict: "fraud",
        fraud_probability: 0.86,
        pattern: "card_testing",
        exposure_usd: 77.07,
        affected_txn_ids: ["3514030"],
        connected_card_ids: ["C11891-K1"],
        connected_device_profiles: ["SAMSUNG SM-G892A | Android 7.0"],
        similar_prior_cases: ["CC-0001", "CC-0011"],
        summary: "Card testing sequence identified on card C12382-K1.",
        written_to_graph: true,
        graph_case_id: "TG-CASE-HHG-001",
        evidence: [
          { claim: "Model scored transaction 3514030 at 0.61 in billing region 444.0.", source: "graph", ref: "query:card_window" },
          { claim: "Cardholder confirmed non-involvement upon inquiry.", source: "customer", ref: "evidence_request:1" }
        ]
      },
      next_best_actions: {
        initial: [
          { action: "DECLINE_TRANSACTION", route: "L1", reason: "R5: Testing sequence observed" },
          { action: "VERIFY_WITH_CUSTOMER", route: "auto", reason: "R1: Verify with customer" }
        ],
        final: [
          { action: "BLOCK_CARD", route: "L1", reason: "R2: Customer denied transaction" },
          { action: "CREATE_CASE", route: "auto", reason: "R2: Internal case created" }
        ],
        what_changed: "Cardholder denial confirmed fraud compromise."
      },
      sar: { file: false, reason: "Exposure under $1,000 threshold" }
    }
  ];
  renderCaseList(allCases);
  selectCase("HHG-001");
}
