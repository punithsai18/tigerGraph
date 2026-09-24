/**
 * TigerGraph Fraud Studio | Controller
 * Unified Agentic Subgraph Traversal & Investigation Dashboard
 */

// Application State
let allCases = [];
let currentCase = null;
let currentCaseId = "C-1024";
let activeTab = "dashboard";
let selectedVector = "fraud_signal";

// Story Mode State
let storyModeActive = false;
let currentStoryPanel = 0;
let threeScene, threeCamera, threeRenderer, threeGraphGroup;
let threeNodeMeshes = [], threeHaloMeshes = [], threeEdgeParticles = [];
let threeAnimId = null;

// Mini Preview Canvas State
let miniAnimId = null;

// Graph Canvas State for Workspace
let graphCanvas, graphCtx;
let graphNodes = [], graphEdges = [];
let graphScale = 1.0, graphOffsetX = 0, graphOffsetY = 0;
let draggingNode = null, hoveredNode = null;
let graphAnimId = null;

// DOM Elements
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupVectorCards();
  setupInvestigationTrigger();
  setupWorkspaceCanvas();
  setupMiniPreviewCanvas();
  setupModals();
  setup3DStoryMode();
  setupAmbient3DStage();
  setupInteractiveSubgraph3D();
  setupDashboardBriefingModal();
  setupDecisionStreamSimulator();
  await loadAllData();
  const urlParams = new URLSearchParams(window.location.search);
  const requestedTab = urlParams.get("tab") || "dashboard";
  navigateToTab(requestedTab);
});

/* ==============================================================================
   NAVIGATION & TAB SWITCHING
   ============================================================================== */
function setupNavigation() {
  const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const tabId = item.dataset.tab;
      if (tabId) navigateToTab(tabId);
    });
  });

  document.getElementById("btnBrandHome").addEventListener("click", () => {
    navigateToTab("dashboard");
  });

  // Story Mode Button in Header
  document.getElementById("btnStoryModeToggle").addEventListener("click", () => {
    openStoryMode();
  });

  // Notifications Toggle
  const btnNotifications = document.getElementById("btnNotifications");
  const notifDropdown = document.getElementById("notifDropdown");
  btnNotifications.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("show");
  });
  document.addEventListener("click", () => {
    notifDropdown.classList.remove("show");
  });

  // Open Full Workspace Button
  document.getElementById("btnOpenFullWorkspace").addEventListener("click", () => {
    loadCaseInWorkspace(currentCaseId || "C-1024");
  });

  // Re-run and Export JSON
  document.getElementById("btnReinvestigate").addEventListener("click", () => {
    loadCaseInWorkspace(currentCaseId);
  });

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

  // FinCEN Narrative Copy
  document.getElementById("btnCopyNarrative").addEventListener("click", () => {
    const text = document.getElementById("sarNarrativeContent").innerText;
    if (text) {
      navigator.clipboard.writeText(text);
      const btn = document.getElementById("btnCopyNarrative");
      btn.innerText = "Copied!";
      setTimeout(() => btn.innerText = "Copy Text", 1500);
    }
  });

  // Simulation Sandbox Replies
  document.getElementById("btnSimDeny").addEventListener("click", () => triggerSimulation("denied"));
  document.getElementById("btnSimConfirm").addEventListener("click", () => triggerSimulation("confirmed"));
}

function navigateToTab(tabId) {
  activeTab = tabId;
  
  // Update sidebar active classes
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
    if (item.dataset.tab === tabId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Update view visibility
  document.querySelectorAll(".view-tab").forEach(tab => {
    tab.classList.remove("active");
  });

  const targetView = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1).replace(/-([a-z])/g, g => g[1].toUpperCase())}`);
  if (targetView) {
    targetView.classList.add("active");
  }

  // Trigger resize or canvas init if workspace is selected
  if (tabId === "workspace") {
    setTimeout(() => {
      resizeGraphCanvas();
      initWorkspaceGraph(currentCase);
    }, 60);
  }
}

/* ==============================================================================
   VECTOR SELECTION & DEMO PRESET SWITCHING
   ============================================================================== */
function setupVectorCards() {
  window.selectVectorCard = function(el, vectorType) {
    selectedVector = vectorType;
    document.querySelectorAll(".vector-card").forEach(c => {
      c.classList.remove("active");
      const rad = c.querySelector(".custom-radio");
      if (rad) rad.classList.remove("checked");
    });

    el.classList.add("active");
    const radio = el.querySelector(".custom-radio");
    if (radio) radio.classList.add("checked");

    // Dynamic weight adjustments
    const weights = {
      fraud_signal: "POL-ATO-01 • Depth 3",
      customer_report: "R1/R3 Inbound Voice • Depth 2",
      analyst_request: "R6 Syndicate Ring Expansion • Depth 4",
      aml_alert: "BSA / OFAC Rules Engine #318 • Depth 2"
    };
    const policies = {
      fraud_signal: "POL-ATO-01 (Account Takeover & Device Mismatch)",
      customer_report: "R1-VERIFY (Cardholder Identity & 2FA Resolution)",
      analyst_request: "R6-RING (Syndicate Community & Off-Ramp Detection)",
      aml_alert: "AML-OFAC (Core Banking Threshold & Sanction Check)"
    };

    document.getElementById("targetPolicyVal").innerText = policies[vectorType] || "POL-ATO-01";
  };
}

function setupInvestigationTrigger() {
  window.loadTriggerPreset = async function(caseId) {
    document.querySelectorAll(".preset-pill").forEach(p => p.classList.remove("active"));
    const clickedPill = Array.from(document.querySelectorAll(".preset-pill")).find(p => p.innerText.includes(caseId));
    if (clickedPill) clickedPill.classList.add("active");

    currentCaseId = caseId;
    document.getElementById("dispatchCaseNotice").innerText = `• Dispatching will allocate Case ID: ${caseId}`;
    document.getElementById("navWorkspaceTitle").innerText = `Workspace (${caseId})`;

    // Load case data
    let data = allCases.find(c => c.case_id === caseId);
    if (!data) {
      try {
        const res = await fetch(`/api/case/${caseId}`);
        if (res.ok) data = await res.json();
      } catch (e) {
        console.error("Could not fetch case preset", e);
      }
    }

    if (data) {
      populateTriggerDetails(data);
    }
  };

  // Reset form button
  document.getElementById("btnResetTriggerForm").addEventListener("click", () => {
    loadTriggerPreset("C-1024");
  });

  // Start Autonomous Investigation
  document.getElementById("btnStartAutonomousInvestigation").addEventListener("click", () => {
    runAutonomousPipelineAnimation();
  });
}

function populateTriggerDetails(data) {
  const c = data.case || {};
  const txnId = c.affected_txn_ids?.[0] || data.flagged_txn_id || "TXN_782391";
  const custId = c.connected_card_ids?.[0]?.split("-")?.[0] || data.customer_id || "CUST_8291";
  const exposure = c.exposure_usd || 4850.0;
  const prob = c.fraud_probability !== undefined ? c.fraud_probability : 0.92;
  const scorePct = Math.round(prob * 100);

  document.getElementById("targetTxnIdVal").innerText = txnId;
  document.getElementById("targetTxnSubDesc").innerText = `Wire $${exposure.toLocaleString(undefined, {minimumFractionDigits: 2})} USD to Beneficiary Account`;

  document.getElementById("targetCustIdVal").innerText = custId;
  document.getElementById("targetCustSubDesc").innerText = `${custId} - Checking ****1234 (Active Entity)`;

  document.getElementById("riskBadgeNumber").innerText = `${scorePct}% CRITICAL`;
  document.getElementById("riskProbLabel").innerText = `${prob.toFixed(3)} Probability Anomaly`;
  document.getElementById("riskIndicatorPin").style.left = `${Math.min(96, Math.max(8, scorePct))}%`;

  if (c.evidence && c.evidence[0]) {
    document.getElementById("synopsisQuoteContent").innerHTML = `"${c.evidence[0].claim}"`;
  }
}

/* ==============================================================================
   LIVE AGENT PIPELINE ANIMATION EXECUTION
   ============================================================================== */
function runAutonomousPipelineAnimation() {
  const badge = document.getElementById("dispatchStatusBadge");
  const desc = document.getElementById("dispatchStatusDesc");
  const terminal = document.getElementById("agentTerminalBody");
  const btn = document.getElementById("btnStartAutonomousInvestigation");

  btn.disabled = true;
  badge.className = "pipe-badge orange";
  badge.innerText = "RUNNING...";

  const logLines = [
    `> [11:51:40] Triggering GSQL multi-hop query on root ${document.getElementById("targetCustIdVal").innerText}...`,
    `> [11:51:41] Traversed 14.2M vertices in 38ms. Resolved proxy device DEV_293.`,
    `> [11:51:41] Discovered 3-hop mule path: ACCT_4421 -> ACCT_9923 -> CRYPTO_EX.`,
    `> [11:51:42] Synthesizing GraphRAG policy POL-ATO-01: Risk elevated to 92% (CRITICAL).`,
    `> [11:51:42] Priming Next-Best Actions: BLOCK_CARD [L2], CREATE_CASE [auto], FILE_REPORT [L2].`,
    `> [11:51:43] Formulating FinCEN SAR narrative... Done in 38ms.`,
    `> [11:51:43] Dispatch complete! Launching Investigation Workspace (${currentCaseId})...`
  ];

  terminal.innerHTML = "";
  let i = 0;

  function appendNextLog() {
    if (i < logLines.length) {
      const line = document.createElement("div");
      line.className = "term-line highlight";
      line.innerText = logLines[i];
      terminal.appendChild(line);
      terminal.scrollTop = terminal.scrollHeight;
      i++;
      setTimeout(appendNextLog, 350);
    } else {
      badge.className = "pipe-badge emerald";
      badge.innerText = "COMPLETE (38ms)";
      desc.innerText = "All evidentiary subgraphs assembled, policy actions primed, and SAR drafted.";
      setTimeout(() => {
        btn.disabled = false;
        loadCaseInWorkspace(currentCaseId);
      }, 700);
    }
  }

  appendNextLog();
}

/* ==============================================================================
   LOAD ALL DATA FROM SERVER
   ============================================================================== */
async function loadAllData() {
  try {
    const res = await fetch("/api/cases");
    if (res.ok) {
      allCases = await res.json();
      renderCasesTable(allCases);
      document.getElementById("sidebarCaseCount").innerText = allCases.length;
      document.getElementById("countAll").innerText = allCases.length;
    }
  } catch (err) {
    console.warn("Could not load /api/cases, using fallback cases", err);
  }

  // Load active case in background without forced tab navigation on initial boot
  loadCaseInWorkspace(currentCaseId, false);

  // Load Alerts
  loadAlerts();

  // Load Policies
  loadPolicies();

  // Load Approvals
  loadApprovals();

  // Load Case Memory cards
  loadCaseMemory();
}

function loadCaseInWorkspace(caseId, navigate = true) {
  currentCaseId = caseId;
  document.getElementById("navWorkspaceTitle").innerText = `Workspace (${caseId})`;

  let cdata = allCases.find(c => c.case_id === caseId);
  if (cdata) {
    currentCase = cdata;
    renderWorkspace(currentCase);
    if (navigate) navigateToTab("workspace");
  } else {
    fetch(`/api/case/${caseId}`)
      .then(res => res.json())
      .then(data => {
        currentCase = data;
        renderWorkspace(currentCase);
        if (navigate) navigateToTab("workspace");
      })
      .catch(err => {
        console.error("Failed to load case", err);
      });
  }
}

/* ==============================================================================
   RENDER WORKSPACE DETAILS
   ============================================================================== */
function renderWorkspace(data) {
  const c = data.case || {};
  document.getElementById("currentCaseIdBadge").innerText = data.case_id;

  const verdict = c.verdict || "fraud";
  const statusBadge = document.getElementById("currentStatusBadge");
  statusBadge.innerText = (c.status || "CLOSED").toUpperCase().replace(/_/g, ' ');
  statusBadge.className = `status-pill ${verdict}`;

  document.getElementById("currentPatternBadge").innerText = (c.pattern || "account_takeover").toUpperCase().replace(/_/g, ' ');

  // Trigger banner
  document.getElementById("triggerTypeLabel").innerText = (data.trigger_type || "FRAUD SIGNAL TRIGGER").toUpperCase().replace(/_/g, ' ');
  document.getElementById("triggerTextContent").innerText = data.trigger_text || c.summary || "Real-time anomaly detector triggered unusual activity.";

  // KPIs
  document.getElementById("kpiRiskScore").innerText = (data.risk_score !== undefined ? data.risk_score : 0.92).toFixed(2);
  document.getElementById("kpiFraudProb").innerText = `${Math.round((c.fraud_probability !== undefined ? c.fraud_probability : 0.92) * 100)}%`;
  document.getElementById("kpiExposure").innerText = `$${(c.exposure_usd || 4850.0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  const ringSize = c.connected_card_ids?.length || 3;
  document.getElementById("kpiRingSize").innerText = `${ringSize} Account${ringSize !== 1 ? 's' : ''}`;
  document.getElementById("kpiDeviceName").innerText = c.connected_device_profiles?.[0] || "DEV_293 | iPhone 15 Pro Proxy";

  // Forensic Evidence
  const evContainer = document.getElementById("evidenceListContainer");
  evContainer.innerHTML = "";
  (c.evidence || []).forEach(ev => {
    const item = document.createElement("div");
    item.className = "evidence-item-card";
    item.innerHTML = `
      <div class="evidence-item-top">
        <span class="evidence-source-tag ${ev.source || 'graph'}">${ev.source || 'graph'}</span>
        <span class="evidence-ref">${ev.ref || 'query:gsql'}</span>
      </div>
      <div class="evidence-claim">${ev.claim}</div>
    `;
    evContainer.appendChild(item);
  });
  document.getElementById("evidenceCountBadge").innerText = `${c.evidence?.length || 0} Findings`;

  // Memory Precedents Chips
  const memContainer = document.getElementById("memoryChipsContainer");
  memContainer.innerHTML = "";
  const priors = c.similar_prior_cases || ["CASE_0872", "CC-1066", "CC-2964"];
  priors.forEach(p => {
    const chip = document.createElement("span");
    chip.className = "memory-chip";
    chip.innerText = `${p} (Vector Match)`;
    chip.onclick = () => {
      navigateToTab("case-memory");
      document.getElementById("memorySearchInput").value = p;
    };
    memContainer.appendChild(chip);
  });

  // NBA Progression
  renderNBAActions(data.next_best_actions || {});

  // FinCEN SAR
  renderSAR(data.sar || {});

  // Audit Footer
  document.getElementById("auditGraphWritten").innerHTML = `&#x2714; Vertex Ingested (${c.graph_case_id || 'TG-CASE-' + data.case_id})`;
  document.getElementById("auditToolCalls").innerText = `${data.tool_calls || 6} GSQL calls`;
  document.getElementById("auditTokens").innerText = `${data.tokens || 2419} tokens`;
  document.getElementById("auditLatency").innerText = `${data.latency_s || 0.038}s`;
  document.getElementById("auditStopReason").innerText = data.stop_reason || "Defensible actions confirmed under policy governance.";

  // Update Graph Canvas
  initWorkspaceGraph(data);
}

function renderNBAActions(nba) {
  const initList = document.getElementById("initialActionsList");
  initList.innerHTML = "";
  (nba.initial || []).forEach(act => {
    const row = document.createElement("div");
    row.className = "action-item-row";
    row.innerHTML = `
      <div class="action-left">
        <span class="action-name">${act.action}</span>
        <span class="route-tag ${act.route}">${act.route}</span>
      </div>
      <div class="action-reason" title="${act.reason}">${act.reason}</div>
    `;
    initList.appendChild(row);
  });

  const finalList = document.getElementById("finalActionsList");
  finalList.innerHTML = "";
  (nba.final || []).forEach(act => {
    const row = document.createElement("div");
    row.className = "action-item-row";
    row.innerHTML = `
      <div class="action-left">
        <span class="action-name">${act.action}</span>
        <span class="route-tag ${act.route}">${act.route}</span>
      </div>
      <div class="action-reason" title="${act.reason}">${act.reason}</div>
    `;
    finalList.appendChild(row);
  });

  document.getElementById("whatChangedText").innerText = nba.what_changed || "Customer response verified and calibrated defensible actions.";
}

function renderSAR(sar) {
  const pill = document.getElementById("sarStatusPill");
  if (sar.file) {
    pill.className = "sar-status-chip required";
    pill.innerText = "REQUIRED (L2 APPROVAL)";
    document.getElementById("sarFilingStatus").innerText = "Mandatory Regulatory Filing";
  } else {
    pill.className = "sar-status-chip none";
    pill.innerText = "EXEMPT (NO FILING)";
    document.getElementById("sarFilingStatus").innerText = "Exempt / Non-Suspicious";
  }

  document.getElementById("sarFilingReason").innerText = sar.reason || "Policy criteria evaluation.";
  document.getElementById("sarTotalAmount").innerText = `$${(sar.total_amount_usd || 0).toLocaleString(undefined, {minimumFractionDigits: 2})} USD`;
  document.getElementById("sarActivityDates").innerText = (sar.activity_dates && sar.activity_dates.length === 2) 
    ? `${sar.activity_dates[0]} to ${sar.activity_dates[1]}` : "2026-09-24 to 2026-09-24";

  const subjContainer = document.getElementById("sarSubjectChips");
  subjContainer.innerHTML = "";
  (sar.subjects || []).forEach(s => {
    const sc = document.createElement("span");
    sc.className = "subj-chip";
    sc.innerText = s;
    subjContainer.appendChild(sc);
  });

  document.getElementById("sarNarrativeContent").innerText = sar.narrative || "No SAR narrative required for this case.";
}

async function triggerSimulation(responseType) {
  const btnDeny = document.getElementById("btnSimDeny");
  const btnConfirm = document.getElementById("btnSimConfirm");

  if (responseType === "denied") {
    btnDeny.classList.add("active");
    btnConfirm.classList.remove("active");
    document.getElementById("simResponseText").innerText = 
      "Cardholder explicitly denied authorizing the transaction and confirmed card remains in possession.";
  } else {
    btnConfirm.classList.add("active");
    btnDeny.classList.remove("active");
    document.getElementById("simResponseText").innerText = 
      "Cardholder contacted via secure channel; confirmed transaction as legitimate authorized activity.";
  }

  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: currentCaseId, response_type: responseType })
    });
    if (res.ok) {
      const updated = await res.json();
      currentCase = updated;
      renderNBAActions(updated.next_best_actions || {});
      renderSAR(updated.sar || {});
      document.getElementById("kpiFraudProb").innerText = `${Math.round((updated.case?.fraud_probability || 0.5) * 100)}%`;
    }
  } catch (err) {
    console.error("Simulation error", err);
  }
}

/* ==============================================================================
   WORKSPACE INTERACTIVE 2D FORCE GRAPH CANVAS
   ============================================================================== */
function setupWorkspaceCanvas() {
  graphCanvas = document.getElementById("graphCanvas");
  if (!graphCanvas) return;
  graphCtx = graphCanvas.getContext("2d");

  window.addEventListener("resize", resizeGraphCanvas);

  document.getElementById("btnZoomIn").addEventListener("click", () => {
    graphScale = Math.min(2.5, graphScale * 1.25);
  });
  document.getElementById("btnZoomOut").addEventListener("click", () => {
    graphScale = Math.max(0.4, graphScale / 1.25);
  });
  document.getElementById("btnResetGraph").addEventListener("click", () => {
    graphScale = 1.0;
    graphOffsetX = 0;
    graphOffsetY = 0;
    initWorkspaceGraph(currentCase);
  });

  // Canvas Mouse Controls
  graphCanvas.addEventListener("mousedown", (e) => {
    const rect = graphCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - graphOffsetX) / graphScale;
    const my = (e.clientY - rect.top - graphOffsetY) / graphScale;

    draggingNode = graphNodes.find(n => {
      const dx = n.x - mx;
      const dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < n.r + 4;
    });
  });

  window.addEventListener("mousemove", (e) => {
    if (draggingNode && graphCanvas) {
      const rect = graphCanvas.getBoundingClientRect();
      draggingNode.x = (e.clientX - rect.left - graphOffsetX) / graphScale;
      draggingNode.y = (e.clientY - rect.top - graphOffsetY) / graphScale;
    }
  });

  window.addEventListener("mouseup", () => {
    draggingNode = null;
  });

  const wrapper = graphCanvas.parentElement;
  if (wrapper && window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (wrapper.clientWidth > 100) {
        resizeGraphCanvas();
        if (graphNodes.length > 0 && graphNodes[0].x === 0 && graphNodes[0].y === 0) {
          initWorkspaceGraph(currentCase);
        }
      }
    });
    ro.observe(wrapper);
  }
}

function resizeGraphCanvas() {
  if (!graphCanvas) return;
  const parent = graphCanvas.parentElement;
  if (!parent) return;
  const w = parent.clientWidth > 100 ? parent.clientWidth : 720;
  const h = parent.clientHeight > 100 ? parent.clientHeight : 440;
  const dpr = window.devicePixelRatio || 1;
  graphCanvas.width = Math.round(w * dpr);
  graphCanvas.height = Math.round(h * dpr);
  graphCanvas.style.width = w + "px";
  graphCanvas.style.height = h + "px";
  if (graphCtx) {
    graphCtx.setTransform(1, 0, 0, 1, 0, 0);
    graphCtx.scale(dpr, dpr);
  }
}

function initWorkspaceGraph(caseData) {
  if (!graphCanvas) return;
  resizeGraphCanvas();

  const parent = graphCanvas.parentElement;
  const width = (parent && parent.clientWidth > 100) ? parent.clientWidth : 720;
  const height = (parent && parent.clientHeight > 100) ? parent.clientHeight : 440;

  const isC1024 = (caseData?.case_id === "C-1024");
  const cx = width * 0.5;
  const cy = height * 0.44;

  graphNodes = [
    { id: "CUST_ROOT", label: isC1024 ? "CUST_8291" : "Cardholder", sub: "Marcus Vance", type: "cust", color: "#3b82f6", r: 24, x: cx, y: cy },
    { id: "DEV_PROXY", label: isC1024 ? "DEV_293" : "Device Profile", sub: "iPhone 15 Proxy", type: "dev", color: "#ef4444", r: 21, x: cx, y: cy - 90 },
    { id: "TXN_FLAGGED", label: isC1024 ? "TXN_782391" : "Txn $4,850", sub: "$4,850 Wire", type: "txn", color: "#ff6a00", r: 22, x: cx, y: cy + 115 },
    { id: "MULE_A", label: "ACCT_4421", sub: "Mule Ring A", type: "ring", color: "#dc2626", r: 19, x: cx - 130, y: cy - 35 },
    { id: "MULE_B", label: "ACCT_9923", sub: "Mule Ring B", type: "ring", color: "#dc2626", r: 19, x: cx + 130, y: cy - 35 },
    { id: "OFF_RAMP", label: "CRYPTO_EX", sub: "Off-Ramp Node", type: "ring", color: "#8b5cf6", r: 22, x: cx + 225, y: cy + 85 },
    { id: "MEM_CASE", label: "CASE C-0872", sub: "89% Memory Match", type: "cust", color: "#10b981", r: 18, x: cx - 215, y: cy + 85 }
  ];

  graphEdges = [
    { from: 0, to: 1, label: "LOGGED_INTO" },
    { from: 1, to: 3, label: "SHARED_PROXY" },
    { from: 1, to: 4, label: "SHARED_PROXY" },
    { from: 0, to: 2, label: "INITIATED_TXN" },
    { from: 2, to: 3, label: "ROUTED_TO" },
    { from: 3, to: 5, label: "OFF_RAMP" },
    { from: 4, to: 5, label: "OFF_RAMP" },
    { from: 0, to: 6, label: "VECTOR_SIMILAR" }
  ];

  if (graphAnimId) cancelAnimationFrame(graphAnimId);
  renderGraphLoop();
}

function renderGraphLoop() {
  if (!graphCanvas) return;
  const parent = graphCanvas.parentElement;
  if (!parent) return;
  const width = parent.clientWidth > 100 ? parent.clientWidth : 720;
  const height = parent.clientHeight > 100 ? parent.clientHeight : 440;

  // Self-heal: If nodes are clumped at (0, 0), reinitialize layout with active dimensions
  if (graphNodes.length > 0 && graphNodes[0].x === 0 && graphNodes[0].y === 0 && width > 100) {
    initWorkspaceGraph(currentCase);
    return;
  }

  graphCtx.clearRect(0, 0, width, height);

  graphCtx.save();
  graphCtx.translate(graphOffsetX, graphOffsetY);
  graphCtx.scale(graphScale, graphScale);

  const cx = width * 0.5;
  const cy = height * 0.44;

  // Cluster Boundary Ring enclosing DEV_PROXY, MULE_A, MULE_B
  graphCtx.beginPath();
  graphCtx.arc(cx, cy - 25, 150, 0, Math.PI * 2);
  graphCtx.fillStyle = "rgba(239, 68, 68, 0.03)";
  graphCtx.strokeStyle = "rgba(239, 68, 68, 0.25)";
  graphCtx.lineWidth = 1.5;
  graphCtx.setLineDash([4, 6]);
  graphCtx.stroke();
  graphCtx.fill();
  graphCtx.setLineDash([]);

  graphCtx.font = "600 10px 'JetBrains Mono', monospace";
  graphCtx.fillStyle = "rgba(220, 38, 38, 0.85)";
  graphCtx.textAlign = "center";
  graphCtx.fillText("TIGERGRAPH CLUSTER #92: MULE RING", cx, cy - 25 - 158);

  // Draw Edges with animated flowing particle
  const now = Date.now() * 0.0012;
  graphEdges.forEach((e, idx) => {
    const n1 = graphNodes[e.from];
    const n2 = graphNodes[e.to];
    if (!n1 || !n2) return;

    graphCtx.beginPath();
    graphCtx.moveTo(n1.x, n1.y);
    graphCtx.lineTo(n2.x, n2.y);
    graphCtx.strokeStyle = (e.from === 1 || e.to === 1) ? "rgba(220, 38, 38, 0.35)" : "rgba(13, 12, 11, 0.16)";
    graphCtx.lineWidth = 1.8;
    graphCtx.stroke();

    // Traveling packet particle
    const t = (now + idx * 0.3) % 1;
    const px = n1.x + (n2.x - n1.x) * t;
    const py = n1.y + (n2.y - n1.y) * t;

    graphCtx.beginPath();
    graphCtx.arc(px, py, 3, 0, Math.PI * 2);
    graphCtx.fillStyle = (e.from === 1 || e.to === 1) ? "#ef4444" : "#ff6a00";
    graphCtx.fill();

    // Edge Label
    const mx = (n1.x + n2.x) / 2;
    const my = (n1.y + n2.y) / 2;
    graphCtx.font = "500 9px 'JetBrains Mono', monospace";
    graphCtx.fillStyle = "rgba(13, 12, 11, 0.5)";
    graphCtx.textAlign = "center";
    graphCtx.fillText(e.label, mx, my - 4);
  });

  // Draw Nodes
  graphNodes.forEach(node => {
    // Outer glow disc
    graphCtx.beginPath();
    graphCtx.arc(node.x, node.y, node.r + 5, 0, Math.PI * 2);
    graphCtx.fillStyle = node.color === "#ef4444" ? "rgba(239, 68, 68, 0.12)" : "rgba(255, 106, 0, 0.10)";
    graphCtx.fill();

    // White disc
    graphCtx.beginPath();
    graphCtx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
    graphCtx.fillStyle = "#ffffff";
    graphCtx.fill();
    graphCtx.strokeStyle = node.color;
    graphCtx.lineWidth = 2.2;
    graphCtx.stroke();

    // Center color dot
    graphCtx.beginPath();
    graphCtx.arc(node.x, node.y, node.r * 0.4, 0, Math.PI * 2);
    graphCtx.fillStyle = node.color;
    graphCtx.fill();

    // Labels
    graphCtx.textAlign = "center";
    graphCtx.font = "700 11px 'JetBrains Mono', monospace";
    graphCtx.fillStyle = "#0d0c0b";
    graphCtx.fillText(node.label, node.x, node.y + node.r + 14);

    graphCtx.font = "400 9.5px 'Inter Tight', sans-serif";
    graphCtx.fillStyle = "rgba(13, 12, 11, 0.6)";
    graphCtx.fillText(node.sub, node.x, node.y + node.r + 26);
  });

  graphCtx.restore();

  graphAnimId = requestAnimationFrame(renderGraphLoop);
}

/* ==============================================================================
   MINI PREVIEW CANVAS (IN TRIGGER NEW INVESTIGATION VIEW)
   ============================================================================== */
function setupMiniPreviewCanvas() {
  const canvas = document.getElementById("miniPreviewCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function drawMini() {
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;
    canvas.width = w;
    canvas.height = h;

    const t = Date.now() * 0.0015;

    // Centered nodes
    const cx = w / 2;
    const cy = h / 2;

    const nodes = [
      { label: "CUST_8291", color: "#3b82f6", x: cx - 90, y: cy },
      { label: "DEV_293", color: "#ef4444", x: cx - 20, y: cy - 45 },
      { label: "TXN_782391", color: "#ff6a00", x: cx, y: cy + 40 },
      { label: "ACCT_4421", color: "#dc2626", x: cx + 70, y: cy - 30 },
      { label: "CRYPTO_EX", color: "#8b5cf6", x: cx + 110, y: cy + 30 }
    ];

    const edges = [
      [0, 1], [0, 2], [1, 3], [2, 3], [3, 4]
    ];

    ctx.clearRect(0, 0, w, h);

    // Edges
    edges.forEach(([i, j], idx) => {
      const p1 = nodes[i];
      const p2 = nodes[j];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = "rgba(13, 12, 11, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Traveling dot
      const dt = (t + idx * 0.3) % 1;
      const dotX = p1.x + (p2.x - p1.x) * dt;
      const dotY = p1.y + (p2.y - p1.y) * dt;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff6a00";
      ctx.fill();
    });

    // Nodes
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(n.x, n.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();

      ctx.textAlign = "center";
      ctx.font = "600 9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#0d0c0b";
      ctx.fillText(n.label, n.x, n.y + 22);
    });

    miniAnimId = requestAnimationFrame(drawMini);
  }

  drawMini();
}

/* ==============================================================================
   VIEW 3: CASES TABLE
   ============================================================================== */
function renderCasesTable(cases) {
  const tbody = document.getElementById("casesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  cases.forEach(c => {
    const verdict = c.case?.verdict || "fraud";
    const status = c.case?.status || "closed";
    const pattern = c.case?.pattern || "none";
    const exposure = c.case?.exposure_usd || 0;
    const score = c.risk_score !== undefined ? c.risk_score : (c.case?.fraud_probability || 0.5);
    const sar = c.sar?.file ? "⚠️ Mandatory" : "Exempt";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.case_id}</strong></td>
      <td><span class="status-pill ${verdict}">${verdict}</span></td>
      <td>${status.replace(/_/g, ' ')}</td>
      <td><span class="pattern-pill">${pattern.replace(/_/g, ' ')}</span></td>
      <td><strong>$${exposure.toFixed(2)}</strong></td>
      <td>${(score).toFixed(2)}</td>
      <td>${sar}</td>
      <td>
        <button class="btn btn-sm btn-primary-sm" onclick="loadCaseInWorkspace('${c.case_id}')">Open Workspace &rarr;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Table Filter Listeners
  const searchInput = document.getElementById("caseTableSearch");
  const chips = document.querySelectorAll(".cases-filter-strip .chip");

  function filterCasesTable() {
    const query = searchInput.value.toLowerCase();
    const activeFilter = document.querySelector(".cases-filter-strip .chip.active")?.dataset.filter || "all";

    const filtered = allCases.filter(c => {
      const cid = (c.case_id || "").toLowerCase();
      const verdict = (c.case?.verdict || "").toLowerCase();
      const pattern = (c.case?.pattern || "").toLowerCase();
      const matchesSearch = cid.includes(query) || verdict.includes(query) || pattern.includes(query);

      if (!matchesSearch) return false;
      if (activeFilter === "all") return true;
      if (activeFilter === "fraud") return verdict === "fraud";
      if (activeFilter === "legitimate") return verdict === "legitimate";
      if (activeFilter === "sar") return c.sar?.file === true;
      if (activeFilter === "high_exposure") return (c.case?.exposure_usd || 0) > 1000;
      return true;
    });

    renderCasesTable(filtered);
  }

  searchInput.addEventListener("input", filterCasesTable);
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      filterCasesTable();
    });
  });
}

/* ==============================================================================
   VIEW 4: ALERTS STREAM
   ============================================================================== */
async function loadAlerts() {
  const container = document.getElementById("alertsFeedGrid");
  if (!container) return;

  try {
    const res = await fetch("/api/alerts");
    if (res.ok) {
      const alerts = await res.json();
      container.innerHTML = "";
      alerts.forEach(alt => {
        const item = document.createElement("div");
        item.className = "alert-card-item";
        item.innerHTML = `
          <div class="alert-head">
            <span class="alert-tag ${alt.severity.toLowerCase()}">${alt.severity}</span>
            <span class="foot-key">${alt.timestamp}</span>
          </div>
          <h4 style="font-size:14px; margin-bottom:4px;">${alt.type} • ${alt.signal_code}</h4>
          <p style="font-size:12px; color:var(--fg-soft); margin-bottom:10px;">
            Target Account: <strong>${alt.account}</strong> | Amount: <strong class="text-orange">${alt.amount}</strong> | Dest: ${alt.dest}
          </p>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-family:var(--font-mono); font-size:11px;">Risk: <strong>${alt.risk_score}</strong></span>
            <button class="btn btn-sm btn-primary-sm" onclick="loadCaseInWorkspace('${alt.case_id}')">Investigate Case &rarr;</button>
          </div>
        `;
        container.appendChild(item);
      });
    }
  } catch (e) {
    console.warn("Could not load /api/alerts", e);
  }
}

/* ==============================================================================
   VIEW 5: GRAPH EXPLORER WORKBENCH
   ============================================================================== */
document.getElementById("btnExecuteGsql").addEventListener("click", () => {
  const q = document.getElementById("gsqlQuerySelect").value;
  const out = document.getElementById("gsqlJsonOutput");
  out.innerText = "Executing GSQL Query via TigerGraph MCP on Port 8142...\nTraversing 14,204,188 vertices...";
  
  setTimeout(() => {
    out.innerText = JSON.stringify({
      status: "SUCCESS",
      query: q,
      engine: "TigerGraph v3.9 Live Savanna Engine",
      latency_ms: 38.4,
      traversed_vertices: 14204188,
      matched_subgraph: {
        root: "CUST_8291",
        proxy_device: "DEV_293 (iPhone 15 Pro, Lagos)",
        mule_nodes: ["ACCT_4421", "ACCT_9923"],
        off_ramp: "CRYPTO_EX (Liquidity Node)",
        hops: 3,
        cluster_confidence: 0.94
      }
    }, null, 2);
  }, 450);
});

/* ==============================================================================
   VIEW 6: CASE MEMORY
   ============================================================================== */
function loadCaseMemory() {
  const container = document.getElementById("memoryCardsGrid");
  if (!container) return;

  const precedents = [
    { id: "CASE_0872", sim: "89% Match", title: "Lagos Proxy Wire Drain Ring", desc: "Coordinated account takeover targeting high-net-worth accounts via TOR relay proxy DEV_293, draining balances into offshore crypto exchange." },
    { id: "CC-1066", sim: "84% Match", title: "Micro-authorization Card Testing", desc: "Syndicate utilizing synthetic cards across 249 cardholders in a 12-minute window before attempting large wire transfer." },
    { id: "CC-2964", sim: "81% Match", title: "Shared Hardware Hash Collision", desc: "iPhone proxy device fingerprint linked across dormant accounts to bypass device reputation filters." },
    { id: "CC-3587", sim: "78% Match", title: "Mule Account Funneling", desc: "Outbound ACH structured transfers divided into multiple sub-$5k wires to avoid immediate BSA currency transaction report triggers." }
  ];

  container.innerHTML = "";
  precedents.forEach(p => {
    const item = document.createElement("div");
    item.className = "memory-item-card";
    item.innerHTML = `
      <div class="mem-card-top">
        <span class="mem-id">${p.id}</span>
        <span class="mem-sim">${p.sim}</span>
      </div>
      <div class="mem-title">${p.title}</div>
      <p class="mem-desc">${p.desc}</p>
    `;
    container.appendChild(item);
  });

  document.getElementById("btnSearchMemory").addEventListener("click", () => {
    loadCaseMemory();
  });
}

/* ==============================================================================
   VIEW 7: POLICIES
   ============================================================================== */
async function loadPolicies() {
  const container = document.getElementById("policiesGrid");
  if (!container) return;

  try {
    const res = await fetch("/api/policies");
    if (res.ok) {
      const policies = await res.json();
      container.innerHTML = "";
      policies.forEach(p => {
        const item = document.createElement("div");
        item.className = "policy-card";
        item.innerHTML = `
          <div class="policy-top">
            <span class="policy-rule">${p.rule}</span>
            <span class="route-tag ${p.route.toLowerCase().includes('l2') ? 'l2' : (p.route.toLowerCase().includes('l1') ? 'l1' : 'auto')}">${p.route}</span>
          </div>
          <div class="policy-name">${p.name}</div>
          <p class="policy-desc">${p.description}</p>
        `;
        container.appendChild(item);
      });
    }
  } catch (e) {
    console.warn("Could not load /api/policies", e);
  }
}

/* ==============================================================================
   VIEW 8: APPROVALS (HITL)
   ============================================================================== */
async function loadApprovals() {
  const container = document.getElementById("approvalsListWrap");
  if (!container) return;

  try {
    const res = await fetch("/api/approvals");
    if (res.ok) {
      const approvals = await res.json();
      const pending = approvals.filter(a => a.status === "pending");
      document.getElementById("approvalCountBadge").innerText = pending.length;

      container.innerHTML = "";
      approvals.forEach(appr => {
        const item = document.createElement("div");
        item.className = "approval-item-card";
        item.innerHTML = `
          <div class="appr-info">
            <h4>${appr.action} — ${appr.target} ($${appr.amount_usd.toFixed(2)})</h4>
            <div class="appr-meta">
              Case ${appr.case_id} • Policy: <strong>${appr.policy}</strong> • Route: <strong>${appr.route}</strong> • Requested: ${appr.requested_at}
            </div>
            <div style="font-size:11.5px; color:var(--fg-faint); margin-top:2px;">${appr.reason}</div>
          </div>
          <div class="appr-actions">
            ${appr.status === "pending" ? `
              <button class="btn btn-sm btn-approve" onclick="resolveApproval('${appr.id}', 'approve')">Approve Action</button>
              <button class="btn btn-sm btn-reject" onclick="resolveApproval('${appr.id}', 'reject')">Reject</button>
            ` : `<span class="pipe-badge ${appr.status === 'approved' ? 'verified' : 'red'}">${appr.status.toUpperCase()}</span>`}
          </div>
        `;
        container.appendChild(item);
      });
    }
  } catch (e) {
    console.warn("Could not load /api/approvals", e);
  }
}

async function resolveApproval(apprId, action) {
  try {
    await fetch(`/api/approvals/${apprId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    loadApprovals();
  } catch (e) {
    console.error("Failed to resolve approval", e);
  }
}

/* ==============================================================================
   MODALS: COMMAND PALETTE (⌘K) & NARRATIVE
   ============================================================================== */
function setupModals() {
  const searchModal = document.getElementById("searchModal");
  const paletteInput = document.getElementById("paletteInput");
  const paletteResults = document.getElementById("paletteResults");

  function openSearchModal() {
    searchModal.classList.add("show");
    paletteInput.value = "";
    paletteInput.focus();
    renderPaletteResults("");
  }

  function closeSearchModal() {
    searchModal.classList.remove("show");
  }

  document.getElementById("globalSearchBar").addEventListener("click", openSearchModal);
  document.getElementById("btnClosePalette").addEventListener("click", closeSearchModal);

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearchModal();
    }
    if (e.key === "Escape") {
      closeSearchModal();
      document.getElementById("narrativeModal").classList.remove("show");
    }
  });

  paletteInput.addEventListener("input", (e) => {
    renderPaletteResults(e.target.value.toLowerCase());
  });

  function renderPaletteResults(query) {
    paletteResults.innerHTML = "";

    const items = [
      { id: "C-1024", desc: "Marcus Vance • Lagos Proxy DEV_293 ATO ($4,850.00 Wire)", type: "case" },
      { id: "HHG-001", desc: "Card Testing Syndicate • Device Collision (Exposure $77.07)", type: "case" },
      { id: "HHG-010", desc: "SAR Mandatory Filing • Unauthorized Exposure > $1,000", type: "case" },
      { id: "HHG-014", desc: "Multi-card Shared Device Syndicate Ring Expansion", type: "case" },
      { id: "DEV_293", desc: "Compromised iPhone 15 Pro Proxy • TOR Relay Exit Node", type: "device" },
      { id: "TXN_782391", desc: "Core Ledger Outbound Wire • Offshore NeoBank Valex Pay", type: "transaction" },
      { id: "POL-ATO-01", desc: "Compliance Rule: Account Takeover & Device Mismatch", type: "policy" }
    ];

    const matched = items.filter(it => it.id.toLowerCase().includes(query) || it.desc.toLowerCase().includes(query));

    matched.forEach(item => {
      const row = document.createElement("div");
      row.className = "palette-item";
      row.innerHTML = `
        <div class="pal-left">
          <span class="pal-id">${item.id}</span>
          <span class="pal-desc">${item.desc}</span>
        </div>
        <span class="pal-type">${item.type}</span>
      `;
      row.onclick = () => {
        closeSearchModal();
        if (item.type === "case") {
          loadCaseInWorkspace(item.id);
        } else if (item.type === "policy") {
          navigateToTab("policies");
        } else {
          loadCaseInWorkspace("C-1024");
        }
      };
      paletteResults.appendChild(row);
    });
  }

  // Narrative Modal
  const narModal = document.getElementById("narrativeModal");
  const narTextarea = document.getElementById("narrativeEditTextarea");
  document.getElementById("btnEditNarrative").addEventListener("click", () => {
    narTextarea.value = document.getElementById("synopsisQuoteContent").innerText.replace(/^"|"$/g, '');
    narModal.classList.add("show");
  });
  document.getElementById("btnCloseNarrative").addEventListener("click", () => narModal.classList.remove("show"));
  document.getElementById("btnCancelNarrative").addEventListener("click", () => narModal.classList.remove("show"));
  document.getElementById("btnSaveNarrative").addEventListener("click", () => {
    document.getElementById("synopsisQuoteContent").innerText = `"${narTextarea.value}"`;
    narModal.classList.remove("show");
  });
}

/* ==============================================================================
   VIEW 10: 3D KINETIC SUBGRAPH STORY MODE (THREE.JS INTEGRATION)
   ============================================================================== */
function setup3DStoryMode() {
  const container = document.getElementById("threejs-container-ANIMATION_16");
  if (!container || typeof THREE === "undefined") return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
  threeCamera.position.set(0, 15, 65);

  threeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(threeRenderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  threeScene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0xff6a00, 2.5, 120);
  pointLight1.position.set(20, 25, 30);
  threeScene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0x3b82f6, 2.0, 100);
  pointLight2.position.set(-25, -15, 20);
  threeScene.add(pointLight2);

  threeGraphGroup = new THREE.Group();
  threeScene.add(threeGraphGroup);

  // Nodes Data
  const nodesData = [
    { id: 'CUST_8291', label: 'Victim Customer', color: 0x3b82f6, size: 2.2, pos: new THREE.Vector3(-18, 6, 2) },
    { id: 'DEV_293', label: 'Compromised Proxy', color: 0xef4444, size: 2.0, pos: new THREE.Vector3(-6, 14, -4) },
    { id: 'IP_94_102', label: 'TOR Relay / ASN', color: 0xf97316, size: 1.6, pos: new THREE.Vector3(-2, 22, -10) },
    { id: 'TXN_7823', label: 'High Velocity Tx ($18.4k)', color: 0xff6a00, size: 2.6, pos: new THREE.Vector3(0, 0, 4) },
    { id: 'ACCT_4421', label: 'Mule Ring A', color: 0xef4444, size: 2.1, pos: new THREE.Vector3(14, 8, -6) },
    { id: 'ACCT_9923', label: 'Mule Ring B', color: 0xdc2626, size: 2.0, pos: new THREE.Vector3(18, -6, 2) },
    { id: 'CRYPTO_EX', label: 'Liquidity Off-Ramp', color: 0x8b5cf6, size: 2.5, pos: new THREE.Vector3(26, -16, -2) },
    { id: 'CASE_0872', label: 'Vector Memory Match (98%)', color: 0x10b981, size: 1.8, pos: new THREE.Vector3(-12, -12, 6) },
    { id: 'DEVICE_FPRINT', label: 'Hardware Hash collision', color: 0x06b6d4, size: 1.5, pos: new THREE.Vector3(-22, -4, -8) },
    { id: 'SUBGRAPH_GSQL', label: 'GSQL Community Cluster', color: 0xff8c38, size: 1.7, pos: new THREE.Vector3(8, -14, 10) }
  ];

  const edgesData = [
    { from: 0, to: 1, alert: true },
    { from: 1, to: 2, alert: true },
    { from: 0, to: 3, alert: true },
    { from: 1, to: 3, alert: true },
    { from: 3, to: 4, alert: true },
    { from: 3, to: 5, alert: true },
    { from: 4, to: 6, alert: true },
    { from: 5, to: 6, alert: true },
    { from: 0, to: 7, alert: false },
    { from: 1, to: 8, alert: false },
    { from: 7, to: 8, alert: false },
    { from: 5, to: 9, alert: false },
    { from: 4, to: 9, alert: false }
  ];

  const sphereGeo = new THREE.SphereGeometry(1, 32, 32);

  nodesData.forEach((node) => {
    const mat = new THREE.MeshPhongMaterial({
      color: node.color,
      emissive: node.color,
      emissiveIntensity: 0.35,
      shininess: 80
    });
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.scale.set(node.size, node.size, node.size);
    mesh.position.copy(node.pos);
    mesh.userData = { id: node.id, label: node.label, baseScale: node.size, basePos: node.pos.clone() };
    threeGraphGroup.add(mesh);
    threeNodeMeshes.push(mesh);

    const ringGeo = new THREE.RingGeometry(node.size * 1.3, node.size * 1.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: node.color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(node.pos);
    ring.rotation.x = Math.PI / 2;
    threeGraphGroup.add(ring);
    threeHaloMeshes.push(ring);
  });

  edgesData.forEach(edge => {
    const p1 = nodesData[edge.from].pos;
    const p2 = nodesData[edge.to].pos;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const lineMat = new THREE.LineBasicMaterial({
      color: edge.alert ? 0xff6a00 : 0x94a3b8,
      transparent: true,
      opacity: edge.alert ? 0.65 : 0.28
    });
    const line = new THREE.Line(lineGeo, lineMat);
    threeGraphGroup.add(line);

    const partGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const partMat = new THREE.MeshBasicMaterial({ color: edge.alert ? 0xff4d00 : 0x38bdf8, transparent: true, opacity: 0.95 });
    const particle = new THREE.Mesh(partGeo, partMat);
    threeGraphGroup.add(particle);
    threeEdgeParticles.push({ mesh: particle, from: p1, to: p2, t: Math.random(), speed: 0.007 });
  });

  // Background dust
  const dustCount = 160;
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount * 3; i += 3) {
    dustPositions[i] = (Math.random() - 0.5) * 120;
    dustPositions[i + 1] = (Math.random() - 0.5) * 90;
    dustPositions[i + 2] = (Math.random() - 0.5) * 80;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xff6a00, size: 0.8, transparent: true, opacity: 0.35 });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  threeScene.add(dustPoints);

  // Mouse tracking
  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  }, { passive: true });

  const clock = new THREE.Clock();
  function animateThree() {
    threeAnimId = requestAnimationFrame(animateThree);
    const elapsed = clock.getElapsedTime();

    threeGraphGroup.rotation.y += (mouseX * 0.4 - threeGraphGroup.rotation.y) * 0.04 + 0.002;
    threeGraphGroup.rotation.x += (-mouseY * 0.25 - threeGraphGroup.rotation.x) * 0.04;

    threeNodeMeshes.forEach((mesh, idx) => {
      const pulse = 1 + 0.08 * Math.sin(elapsed * 2.8 + idx * 0.9);
      mesh.scale.set(mesh.userData.baseScale * pulse, mesh.userData.baseScale * pulse, mesh.userData.baseScale * pulse);
      mesh.position.y = mesh.userData.basePos.y + Math.sin(elapsed * 1.5 + idx) * 0.4;
    });

    threeHaloMeshes.forEach((ring, idx) => {
      ring.rotation.z += 0.015 * (idx % 2 === 0 ? 1 : -1);
      ring.position.y = threeNodeMeshes[idx].position.y;
    });

    threeEdgeParticles.forEach(ep => {
      ep.t += ep.speed;
      if (ep.t > 1) ep.t = 0;
      ep.mesh.position.lerpVectors(ep.from, ep.to, ep.t);
    });

    dustPoints.rotation.y = elapsed * 0.02;

    threeRenderer.render(threeScene, threeCamera);
  }

  animateThree();

  document.getElementById("btnExitStoryMode").addEventListener("click", closeStoryMode);
}

function openStoryMode() {
  storyModeActive = true;
  document.getElementById("storyModeContainer").classList.add("show");
  setStoryPanel(0);
}

function closeStoryMode() {
  storyModeActive = false;
  document.getElementById("storyModeContainer").classList.remove("show");
}

function setStoryPanel(idx) {
  currentStoryPanel = idx;
  const panels = document.querySelectorAll(".story-panel");
  panels.forEach((p, i) => {
    if (i === idx) p.classList.add("active");
    else p.classList.remove("active");
  });
}

window.advanceStory = function(nextIdx) {
  setStoryPanel(nextIdx);
};

window.exitStoryModeAndLoadWorkspace = function(caseId) {
  closeStoryMode();
  loadCaseInWorkspace(caseId);
};

/* ==============================================================================
   GLOBAL AMBIENT 3D SUBGRAPH STAGE (BACKGROUND ENGINE)
   ============================================================================== */
let ambientThreeScene, ambientThreeCamera, ambientThreeRenderer, ambientGraphGroup;
let ambientNodeMeshes = [], ambientHaloMeshes = [], ambientEdgeParticles = [];
let ambientDustPoints = null;

function setupAmbient3DStage() {
  const container = document.getElementById("ambient-threejs-container");
  if (!container || typeof THREE === "undefined") return;

  const w = window.innerWidth;
  const h = window.innerHeight;

  ambientThreeScene = new THREE.Scene();
  ambientThreeCamera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
  ambientThreeCamera.position.set(0, 15, 65);

  ambientThreeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  ambientThreeRenderer.setSize(w, h);
  ambientThreeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = "";
  container.appendChild(ambientThreeRenderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
  ambientThreeScene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0xff6a00, 2.5, 120);
  pointLight1.position.set(20, 25, 30);
  ambientThreeScene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0x3b82f6, 2.0, 100);
  pointLight2.position.set(-25, -15, 20);
  ambientThreeScene.add(pointLight2);

  ambientGraphGroup = new THREE.Group();
  ambientThreeScene.add(ambientGraphGroup);

  // Nodes Data (Investigation Case C-1024 Topology)
  const nodesData = [
    { id: 'CUST_8291', label: 'Victim Customer', color: 0x3b82f6, size: 2.2, pos: new THREE.Vector3(-18, 6, 2) },
    { id: 'DEV_293', label: 'Compromised Proxy', color: 0xef4444, size: 2.0, pos: new THREE.Vector3(-6, 14, -4) },
    { id: 'IP_94_102', label: 'TOR Relay / ASN', color: 0xf97316, size: 1.6, pos: new THREE.Vector3(-2, 22, -10) },
    { id: 'TXN_7823', label: 'High Velocity Tx ($18.4k)', color: 0xff6a00, size: 2.6, pos: new THREE.Vector3(0, 0, 4) },
    { id: 'ACCT_4421', label: 'Mule Ring A', color: 0xef4444, size: 2.1, pos: new THREE.Vector3(14, 8, -6) },
    { id: 'ACCT_9923', label: 'Mule Ring B', color: 0xdc2626, size: 2.0, pos: new THREE.Vector3(18, -6, 2) },
    { id: 'CRYPTO_EX', label: 'Liquidity Off-Ramp', color: 0x8b5cf6, size: 2.5, pos: new THREE.Vector3(26, -16, -2) },
    { id: 'CASE_0872', label: 'Vector Memory Match (98%)', color: 0x10b981, size: 1.8, pos: new THREE.Vector3(-12, -12, 6) },
    { id: 'DEVICE_FPRINT', label: 'Hardware Hash collision', color: 0x06b6d4, size: 1.5, pos: new THREE.Vector3(-22, -4, -8) },
    { id: 'SUBGRAPH_GSQL', label: 'GSQL Community Cluster', color: 0xff8c38, size: 1.7, pos: new THREE.Vector3(8, -14, 10) }
  ];

  const edgesData = [
    { from: 0, to: 1, alert: true },
    { from: 1, to: 2, alert: true },
    { from: 0, to: 3, alert: true },
    { from: 1, to: 3, alert: true },
    { from: 3, to: 4, alert: true },
    { from: 3, to: 5, alert: true },
    { from: 4, to: 6, alert: true },
    { from: 5, to: 6, alert: true },
    { from: 0, to: 7, alert: false },
    { from: 1, to: 8, alert: false },
    { from: 7, to: 8, alert: false },
    { from: 5, to: 9, alert: false },
    { from: 4, to: 9, alert: false }
  ];

  const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
  ambientNodeMeshes = [];
  ambientHaloMeshes = [];

  nodesData.forEach((node) => {
    const mat = new THREE.MeshPhongMaterial({
      color: node.color,
      emissive: node.color,
      emissiveIntensity: 0.35,
      shininess: 80
    });
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.scale.set(node.size, node.size, node.size);
    mesh.position.copy(node.pos);
    mesh.userData = { id: node.id, label: node.label, baseScale: node.size, basePos: node.pos.clone() };
    ambientGraphGroup.add(mesh);
    ambientNodeMeshes.push(mesh);

    const ringGeo = new THREE.RingGeometry(node.size * 1.3, node.size * 1.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: node.color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(node.pos);
    ring.rotation.x = Math.PI / 2;
    ambientGraphGroup.add(ring);
    ambientHaloMeshes.push(ring);
  });

  ambientEdgeParticles = [];
  edgesData.forEach(edge => {
    const p1 = nodesData[edge.from].pos;
    const p2 = nodesData[edge.to].pos;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const lineMat = new THREE.LineBasicMaterial({
      color: edge.alert ? 0xff6a00 : 0x94a3b8,
      transparent: true,
      opacity: edge.alert ? 0.65 : 0.28
    });
    const line = new THREE.Line(lineGeo, lineMat);
    ambientGraphGroup.add(line);

    const partGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const partMat = new THREE.MeshBasicMaterial({ color: edge.alert ? 0xff4d00 : 0x38bdf8, transparent: true, opacity: 0.95 });
    const particle = new THREE.Mesh(partGeo, partMat);
    ambientGraphGroup.add(particle);
    ambientEdgeParticles.push({
      mesh: particle,
      from: p1,
      to: p2,
      t: Math.random(),
      speed: 0.005 + Math.random() * 0.006
    });
  });

  // Cyber dust
  const dustCount = 180;
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount * 3; i += 3) {
    dustPositions[i] = (Math.random() - 0.5) * 120;
    dustPositions[i + 1] = (Math.random() - 0.5) * 90;
    dustPositions[i + 2] = (Math.random() - 0.5) * 80;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xff6a00,
    size: 0.8,
    transparent: true,
    opacity: 0.35
  });
  ambientDustPoints = new THREE.Points(dustGeo, dustMat);
  ambientThreeScene.add(ambientDustPoints);

  // Mouse Parallax Tracking
  let mouseX = 0, mouseY = 0;
  let targetRotX = 0, targetRotY = 0;
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    targetRotY = mouseX * 0.4;
    targetRotX = -mouseY * 0.25;
  }, { passive: true });

  window.addEventListener('resize', () => {
    const nw = window.innerWidth;
    const nh = window.innerHeight;
    ambientThreeCamera.aspect = nw / nh;
    ambientThreeCamera.updateProjectionMatrix();
    ambientThreeRenderer.setSize(nw, nh);
  });

  const clock = new THREE.Clock();
  function animateAmbientStage() {
    requestAnimationFrame(animateAmbientStage);
    const elapsed = clock.getElapsedTime();

    ambientGraphGroup.rotation.y += (targetRotY - ambientGraphGroup.rotation.y) * 0.04 + 0.002;
    ambientGraphGroup.rotation.x += (targetRotX - ambientGraphGroup.rotation.x) * 0.04;

    ambientNodeMeshes.forEach((mesh, idx) => {
      const pulse = 1 + 0.08 * Math.sin(elapsed * 2.8 + idx * 0.9);
      mesh.scale.set(mesh.userData.baseScale * pulse, mesh.userData.baseScale * pulse, mesh.userData.baseScale * pulse);
      mesh.position.y = mesh.userData.basePos.y + Math.sin(elapsed * 1.5 + idx) * 0.4;
    });

    ambientHaloMeshes.forEach((ring, idx) => {
      ring.rotation.z += 0.015 * (idx % 2 === 0 ? 1 : -1);
      ring.position.y = ambientNodeMeshes[idx].position.y;
      const ringScale = 1 + 0.15 * Math.sin(elapsed * 3.2 + idx);
      ring.scale.set(ringScale, ringScale, 1);
    });

    ambientEdgeParticles.forEach(ep => {
      ep.t += ep.speed;
      if (ep.t > 1) ep.t = 0;
      ep.mesh.position.lerpVectors(ep.from, ep.to, ep.t);
    });

    if (ambientDustPoints) {
      ambientDustPoints.rotation.y = elapsed * 0.02;
      ambientDustPoints.rotation.x = elapsed * 0.01;
    }

    ambientThreeRenderer.render(ambientThreeScene, ambientThreeCamera);
  }
  animateAmbientStage();
}

/* ==============================================================================
   INTERACTIVE 3D SUBGRAPH STAGE (DASHBOARD WIDGET WITH ORBIT/DRAG CONTROLS)
   ============================================================================== */
let subThreeScene, subThreeCamera, subThreeRenderer, subGraphGroup;
let subNodeMeshes = [], subHaloMeshes = [], subEdgeParticles = [];

function setupInteractiveSubgraph3D() {
  const container = document.getElementById("subgraphThreeContainer");
  if (!container || typeof THREE === "undefined") return;

  const w = container.clientWidth || 340;
  const h = container.clientHeight || 230;

  subThreeScene = new THREE.Scene();
  subThreeCamera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
  subThreeCamera.position.set(0, 10, 48);

  subThreeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  subThreeRenderer.setSize(w, h);
  subThreeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = "";
  container.appendChild(subThreeRenderer.domElement);

  // Lighting
  const ambLight = new THREE.AmbientLight(0xffffff, 1.1);
  subThreeScene.add(ambLight);

  const ptLight1 = new THREE.PointLight(0xff6a00, 3.0, 90);
  ptLight1.position.set(15, 18, 25);
  subThreeScene.add(ptLight1);

  const ptLight2 = new THREE.PointLight(0x3b82f6, 2.5, 90);
  ptLight2.position.set(-15, -12, 18);
  subThreeScene.add(ptLight2);

  subGraphGroup = new THREE.Group();
  subThreeScene.add(subGraphGroup);

  // Nodes for Subgraph Ring (Cluster #92 & Cashout Funnel #14)
  const ringNodes = [
    { id: 'FP_9821', label: 'Cluster #92 (Collision)', color: 0xef4444, size: 2.3, pos: new THREE.Vector3(0, 2, 2) },
    { id: 'CUST_8291', label: 'CUST_8291 (Marcus V.)', color: 0x3b82f6, size: 1.8, pos: new THREE.Vector3(-12, 7, 0) },
    { id: 'DEV_293', label: 'Proxy DEV_293', color: 0xff6a00, size: 1.7, pos: new THREE.Vector3(-6, -8, 6) },
    { id: 'ACCT_4421', label: 'Mule ACCT_4421', color: 0xdc2626, size: 1.9, pos: new THREE.Vector3(11, 8, -4) },
    { id: 'ACCT_9923', label: 'Mule ACCT_9923', color: 0xdc2626, size: 1.8, pos: new THREE.Vector3(14, -6, 4) },
    { id: 'RAPID_ACH', label: '12 ACH Endpoints', color: 0x06b6d4, size: 1.5, pos: new THREE.Vector3(-15, -4, -6) },
    { id: 'CRYPTO_EX', label: 'Crypto Off-Ramp', color: 0x8b5cf6, size: 2.1, pos: new THREE.Vector3(20, -12, -2) }
  ];

  const ringEdges = [
    { from: 1, to: 0, alert: true },
    { from: 2, to: 0, alert: true },
    { from: 0, to: 3, alert: true },
    { from: 0, to: 4, alert: true },
    { from: 5, to: 1, alert: false },
    { from: 3, to: 6, alert: true },
    { from: 4, to: 6, alert: true }
  ];

  const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
  subNodeMeshes = [];
  subHaloMeshes = [];

  ringNodes.forEach(node => {
    const mat = new THREE.MeshPhongMaterial({
      color: node.color,
      emissive: node.color,
      emissiveIntensity: 0.4,
      shininess: 90
    });
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.scale.set(node.size, node.size, node.size);
    mesh.position.copy(node.pos);
    mesh.userData = { id: node.id, label: node.label, baseScale: node.size, basePos: node.pos.clone() };
    subGraphGroup.add(mesh);
    subNodeMeshes.push(mesh);

    const ringGeo = new THREE.RingGeometry(node.size * 1.3, node.size * 1.55, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: node.color, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(node.pos);
    ring.rotation.x = Math.PI / 2;
    subGraphGroup.add(ring);
    subHaloMeshes.push(ring);
  });

  subEdgeParticles = [];
  ringEdges.forEach(edge => {
    const p1 = ringNodes[edge.from].pos;
    const p2 = ringNodes[edge.to].pos;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const lineMat = new THREE.LineBasicMaterial({
      color: edge.alert ? 0xff4d00 : 0x64748b,
      transparent: true,
      opacity: edge.alert ? 0.75 : 0.35,
      linewidth: 2
    });
    const line = new THREE.Line(lineGeo, lineMat);
    subGraphGroup.add(line);

    const partGeo = new THREE.SphereGeometry(0.38, 12, 12);
    const partMat = new THREE.MeshBasicMaterial({ color: edge.alert ? 0xff3b00 : 0x38bdf8, transparent: true, opacity: 0.95 });
    const particle = new THREE.Mesh(partGeo, partMat);
    subGraphGroup.add(particle);
    subEdgeParticles.push({
      mesh: particle,
      from: p1,
      to: p2,
      t: Math.random(),
      speed: 0.008 + Math.random() * 0.008
    });
  });

  // Drag Orbit Controls
  let isDragging = false;
  let prevX = 0, prevY = 0;
  let autoRotate = true;

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    autoRotate = false;
    prevX = e.clientX;
    prevY = e.clientY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevX;
    const deltaY = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;

    subGraphGroup.rotation.y += deltaX * 0.012;
    subGraphGroup.rotation.x += deltaY * 0.012;
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      setTimeout(() => autoRotate = true, 3000);
    }
  });

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    subThreeCamera.position.z = Math.max(25, Math.min(75, subThreeCamera.position.z + e.deltaY * 0.04));
  }, { passive: false });

  // Resize handler
  window.addEventListener('resize', () => {
    const rw = container.clientWidth || 340;
    const rh = container.clientHeight || 230;
    subThreeCamera.aspect = rw / rh;
    subThreeCamera.updateProjectionMatrix();
    subThreeRenderer.setSize(rw, rh);
  });

  const clock = new THREE.Clock();
  function animateSubGraph() {
    requestAnimationFrame(animateSubGraph);
    const elapsed = clock.getElapsedTime();

    if (autoRotate) {
      subGraphGroup.rotation.y += 0.004;
    }

    subNodeMeshes.forEach((mesh, idx) => {
      const pulse = 1 + 0.09 * Math.sin(elapsed * 3.0 + idx * 0.8);
      mesh.scale.set(mesh.userData.baseScale * pulse, mesh.userData.baseScale * pulse, mesh.userData.baseScale * pulse);
      mesh.position.y = mesh.userData.basePos.y + Math.sin(elapsed * 1.8 + idx) * 0.3;
    });

    subHaloMeshes.forEach((ring, idx) => {
      ring.rotation.z += 0.02 * (idx % 2 === 0 ? 1 : -1);
      ring.position.y = subNodeMeshes[idx].position.y;
    });

    subEdgeParticles.forEach(ep => {
      ep.t += ep.speed;
      if (ep.t > 1) ep.t = 0;
      ep.mesh.position.lerpVectors(ep.from, ep.to, ep.t);
    });

    subThreeRenderer.render(subThreeScene, subThreeCamera);
  }
  animateSubGraph();
}

/* ==============================================================================
   EXPORT MORNING BRIEFING MODAL
   ============================================================================== */
function setupDashboardBriefingModal() {
  const btnExport = document.getElementById("btnExportBriefing");
  const modal = document.getElementById("briefingModal");
  const btnClose = document.getElementById("closeBriefingModal");
  const btnCloseFooter = document.getElementById("btnCloseBriefing");
  const btnCopy = document.getElementById("btnCopyBriefing");
  const btnDownload = document.getElementById("btnDownloadBriefing");

  if (!btnExport || !modal) return;

  btnExport.addEventListener("click", () => {
    modal.classList.add("show");
  });

  const hideModal = () => modal.classList.remove("show");
  if (btnClose) btnClose.addEventListener("click", hideModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener("click", hideModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideModal();
  });

  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      const content = document.getElementById("briefingTextContent")?.innerText || "";
      if (content) {
        navigator.clipboard.writeText(content).then(() => {
          const originalText = btnCopy.innerHTML;
          btnCopy.innerHTML = "<span>Copied to Clipboard!</span>";
          setTimeout(() => btnCopy.innerHTML = originalText, 1800);
        });
      }
    });
  }

  if (btnDownload) {
    btnDownload.addEventListener("click", () => {
      const content = document.getElementById("briefingTextContent")?.innerText || "";
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TigerGraph_Morning_Briefing_${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

/* ==============================================================================
   LIVE AGENT DECISION STREAM (STREAM SIMULATOR)
   ============================================================================== */
function setupDecisionStreamSimulator() {
  const container = document.getElementById("agentDecisionStreamList");
  if (!container) return;

  const eventPool = [
    { badge: "amber", badgeText: "TOOL_EXEC", text: "Agent executed tg_query('detect_fast_mule_hops')", tag: "purple", tagText: "3 new mule hops" },
    { badge: "green", badgeText: "GRAPH_EVAL", text: "Multi-hop graph score on ACCT_4421 exceeded 0.88 threshold", tag: "blue", tagText: "Confidence: 94%" },
    { badge: "blue", badgeText: "API_DISPATCH", text: "Challenge OTP token delivered via Open Banking webhook", tag: "gray", tagText: "2FA Sent" },
    { badge: "red", badgeText: "SAR_DRAFT", text: "FinCEN SAR narrative synthesized for Case C-1024", tag: "red", tagText: "SAR Required" },
    { badge: "amber", badgeText: "VECTOR_KNN", text: "Nearest neighbor query matched CaseMemory pattern C-0872", tag: "green", tagText: "Cosine: 0.982" },
    { badge: "green", badgeText: "POLICY_GOV", text: "GraphRAG Rule POL-ATO-01 validated: Non-destructive step-up armed", tag: "blue", tagText: "Compliant" }
  ];

  let poolIdx = 0;
  setInterval(() => {
    // Only animate if dashboard is active
    if (activeTab !== "dashboard") return;

    const ev = eventPool[poolIdx % eventPool.length];
    poolIdx++;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const item = document.createElement("div");
    item.className = "stream-item";
    item.style.animation = "fadeIn 0.3s ease";
    item.innerHTML = `
      <span class="stream-time text-mono">${timeStr}</span>
      <span class="stream-badge ${ev.badge}">${ev.badgeText}</span>
      <span class="stream-text">${ev.text}</span>
      <span class="stream-tag ${ev.tag}">${ev.tagText}</span>
    `;

    container.insertBefore(item, container.firstChild);
    if (container.children.length > 5) {
      container.removeChild(container.lastChild);
    }
  }, 9000);
}

