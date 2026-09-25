"""
TigerGraph Sentinel | Fraud Investigation FastAPI Server
Serves the Analyst Web Dashboard and REST API for case investigation,
Graph traversal, and FinCEN SAR reporting.
"""

import os
import json
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional

from agent.investigator import FraudInvestigationAgent
from tigergraph.tg_client import TigerGraphClient
from agent.memory import CaseMemory

app = FastAPI(title="TigerGraph Sentinel Fraud Investigation API")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
CASES_DIR = os.path.join(BASE_DIR, "cases")
DATA_DIR = os.path.join(BASE_DIR, "data")

# Mount static web directory
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

# Shared Agent Singleton
tg_client = TigerGraphClient(mode="embedded", data_dir=DATA_DIR)
memory = CaseMemory(data_dir=DATA_DIR)
agent = FraudInvestigationAgent(tg_client=tg_client, memory=memory)

# In-memory approval queue for HITL demo
APPROVAL_QUEUE = [
    {
        "id": "APPR-1024",
        "case_id": "C-1024",
        "action": "BLOCK_CARD",
        "target": "CUST_8291 (Marcus Vance)",
        "amount_usd": 4850.00,
        "policy": "R2 / POL-ATO-01",
        "route": "L2",
        "reason": "Customer denial confirmed account takeover via Lagos proxy DEV_293",
        "status": "pending",
        "requested_at": "2026-09-24 11:48:12"
    },
    {
        "id": "APPR-1010",
        "case_id": "HHG-010",
        "action": "FILE_REPORT",
        "target": "C12043-K1 / $2,840.00",
        "amount_usd": 2840.00,
        "policy": "R2 / BSA Threshold",
        "route": "L2",
        "reason": "Unauthorized exposure exceeds $1,000 regulatory reporting requirement",
        "status": "pending",
        "requested_at": "2026-09-24 11:35:04"
    }
]

# Real-time alerts feed
ALERTS_FEED = [
    {
        "id": "ALT-9182",
        "severity": "CRITICAL",
        "type": "Fraud Signal",
        "signal_code": "VeloAnomaly-09",
        "case_id": "C-1024",
        "account": "CUST_8291",
        "amount": "$4,850.00",
        "dest": "Offshore NeoBank (Valex Pay)",
        "risk_score": 0.92,
        "timestamp": "Just now",
        "status": "Triaged (Agent Running)"
    },
    {
        "id": "ALT-9180",
        "severity": "HIGH",
        "type": "Transaction Alert",
        "signal_code": "Rules Engine #318",
        "case_id": "HHG-014",
        "account": "C11000-K1",
        "amount": "$1,450.00",
        "dest": "Electronics Store NYC",
        "risk_score": 0.88,
        "timestamp": "4 mins ago",
        "status": "Pending Review"
    },
    {
        "id": "ALT-9177",
        "severity": "MEDIUM",
        "type": "Customer Report",
        "signal_code": "Mobile App Lock",
        "case_id": "HHG-001",
        "account": "C12382-K1",
        "amount": "$77.07",
        "dest": "Digital Gaming",
        "risk_score": 0.61,
        "timestamp": "12 mins ago",
        "status": "Closed Legitimate"
    },
    {
        "id": "ALT-9172",
        "severity": "HIGH",
        "type": "Analyst Request",
        "signal_code": "Link Analysis Ring",
        "case_id": "HHG-004",
        "account": "C09872-K1",
        "amount": "$620.00",
        "dest": "P2P Transfer",
        "risk_score": 0.81,
        "timestamp": "28 mins ago",
        "status": "Under Investigation"
    }
]


class SimulationRequest(BaseModel):
    case_id: str
    response_type: str  # "denied" or "confirmed"


class InvestigateRequest(BaseModel):
    case_id: Optional[str] = "C-1024"
    trigger_type: Optional[str] = "fraud_signal"
    trigger_text: Optional[str] = None
    flagged_txn_id: Optional[str] = "TXN_782391"
    customer_id: Optional[str] = "CUST_8291"
    card_id: Optional[str] = "CUST_8291-CH1234"
    risk_score: Optional[float] = 0.92


class ApprovalActionRequest(BaseModel):
    action: str  # "approve" or "reject"
    notes: Optional[str] = "Approved by Senior Fraud Lead"


@app.on_event("startup")
async def startup_event():
    print("[Server] Initializing TigerGraph Client and Case Memory...")
    tg_client.initialize()
    memory.initialize()
    agent.initialize()
    print("[Server] Ready to process fraud investigations.")


@app.get("/")
async def root():
    landing_path = os.path.join(WEB_DIR, "landing.html")
    if os.path.exists(landing_path):
        return FileResponse(landing_path)
    index_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Page not found")


@app.get("/landing")
async def landing_page():
    landing_path = os.path.join(WEB_DIR, "landing.html")
    if os.path.exists(landing_path):
        return FileResponse(landing_path)
    raise HTTPException(status_code=404, detail="landing.html not found")


@app.get("/login")
async def login_page():
    login_path = os.path.join(WEB_DIR, "login.html")
    if os.path.exists(login_path):
        return FileResponse(login_path)
    raise HTTPException(status_code=404, detail="login.html not found")


@app.get("/dashboard")
async def dashboard_page():
    index_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="index.html not found")


@app.get("/app")
async def app_view():
    index_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="index.html not found")


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "tigergraph_mode": tg_client.mode,
        "gsql_version": "v3.9",
        "mcp_port": 8142,
        "case_memory_count": len(memory.cases),
        "devices_indexed": len(tg_client.devices),
        "latency_grpc": "38ms"
    }


@app.get("/api/cases")
async def get_all_cases():
    """Returns list of all benchmark cases from cases/ directory or case_pack.csv."""
    results = []
    if os.path.exists(CASES_DIR):
        case_files = sorted([f for f in os.listdir(CASES_DIR) if f.endswith(".json")])
        # Sort so C-1024 or HHG-001 is placed conveniently
        for cfile in case_files:
            try:
                with open(os.path.join(CASES_DIR, cfile), "r", encoding="utf-8") as f:
                    data = json.load(f)
                    results.append(data)
            except Exception as e:
                print(f"Error reading {cfile}: {e}")

    # If cases directory has not been populated yet, load from case_pack
    if not results:
        case_pack_path = os.path.join(DATA_DIR, "case_pack.csv")
        if os.path.exists(case_pack_path):
            import pandas as pd
            df = pd.read_csv(case_pack_path, dtype=str)
            for _, row in df.iterrows():
                cid = str(row["case_id"])
                case_meta = {
                    "case_id": cid,
                    "opened_at": str(row.get("opened_at", "")),
                    "trigger_type": str(row.get("trigger_type", "")),
                    "trigger_text": str(row.get("trigger_text", "")),
                    "flagged_txn_id": str(row.get("flagged_txn_id", "")),
                    "card_id": str(row.get("card_id", "")),
                    "customer_id": str(row.get("customer_id", "")),
                    "risk_score": float(row.get("risk_score")) if pd.notna(row.get("risk_score")) and row.get("risk_score") != "" else 0.50
                }
                res = agent.investigate_case(case_meta)
                results.append(res)
    return results


@app.get("/api/case/{case_id}")
async def get_case(case_id: str):
    """Retrieves full investigation document for a single case."""
    case_path = os.path.join(CASES_DIR, f"{case_id}.json")
    if os.path.exists(case_path):
        with open(case_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Fallback to dynamic investigation
    case_pack_path = os.path.join(DATA_DIR, "case_pack.csv")
    if os.path.exists(case_pack_path):
        import pandas as pd
        df = pd.read_csv(case_pack_path, dtype=str)
        matched = df[df["case_id"] == case_id]
        if not matched.empty:
            row = matched.iloc[0]
            case_meta = {
                "case_id": case_id,
                "opened_at": str(row.get("opened_at", "")),
                "trigger_type": str(row.get("trigger_type", "")),
                "trigger_text": str(row.get("trigger_text", "")),
                "flagged_txn_id": str(row.get("flagged_txn_id", "")),
                "card_id": str(row.get("card_id", "")),
                "customer_id": str(row.get("customer_id", "")),
                "risk_score": float(row.get("risk_score")) if pd.notna(row.get("risk_score")) and row.get("risk_score") != "" else 0.50
            }
            return agent.investigate_case(case_meta)

    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


@app.post("/api/investigate")
async def trigger_investigation(req: InvestigateRequest):
    """Triggers autonomous investigation on target transaction & customer."""
    case_id = req.case_id or "C-1024"
    case_path = os.path.join(CASES_DIR, f"{case_id}.json")
    if os.path.exists(case_path):
        with open(case_path, "r", encoding="utf-8") as f:
            return json.load(f)

    case_meta = {
        "case_id": case_id,
        "trigger_type": req.trigger_type,
        "trigger_text": req.trigger_text or "Autonomous investigation trigger",
        "flagged_txn_id": req.flagged_txn_id,
        "card_id": req.card_id,
        "customer_id": req.customer_id,
        "risk_score": req.risk_score
    }
    result = agent.investigate_case(case_meta)
    return result


@app.post("/api/simulate")
async def simulate_evidence(req: SimulationRequest):
    """Simulates customer reply (denied vs confirmed) and computes updated policy NBAs."""
    case_path = os.path.join(CASES_DIR, f"{req.case_id}.json")
    if not os.path.exists(case_path):
        raise HTTPException(status_code=404, detail="Case not found")

    with open(case_path, "r", encoding="utf-8") as f:
        case_data = json.load(f)

    is_denied = (req.response_type.lower() == "denied")
    exposure = case_data.get("case", {}).get("exposure_usd", 0.0)

    if is_denied:
        case_data["case"]["verdict"] = "fraud"
        case_data["case"]["status"] = "closed_fraud"
        case_data["case"]["fraud_probability"] = 0.92
        case_data["next_best_actions"]["final"] = [
            {"action": "BLOCK_CARD", "route": "L2" if exposure > 2500 else "L1", "reason": f"R2: Customer denied authorizing charge of ${exposure:.2f}"},
            {"action": "CREATE_CASE", "route": "auto", "reason": "R6: Fraud case confirmed, entity linkages established"},
        ]
        if exposure > 1000:
            case_data["next_best_actions"]["final"].append({
                "action": "FILE_REPORT", "route": "L2", "reason": f"R2: Unauthorized exposure (${exposure:.2f}) exceeds $1,000 threshold"
            })
            case_data["sar"]["file"] = True
        case_data["next_best_actions"]["what_changed"] = f"Cardholder explicitly denied authorization. Fraud probability calibrated to 0.92, confirming card freeze, case creation, and regulatory filing."
    else:
        case_data["case"]["verdict"] = "legitimate"
        case_data["case"]["status"] = "closed_legitimate"
        case_data["case"]["fraud_probability"] = 0.08
        case_data["next_best_actions"]["final"] = [
            {"action": "ALLOW_TRANSACTION", "route": "auto", "reason": "R3: Customer confirmed transaction as legitimate cardholder activity"},
            {"action": "CLOSE_NO_FRAUD", "route": "auto", "reason": "R3: Cardholder verified identity and possession; alert closed without friction"}
        ]
        case_data["sar"]["file"] = False
        case_data["next_best_actions"]["what_changed"] = "Customer verified transaction as legitimate cardholder activity. Initial verification and holds cleared with zero customer friction."

    return case_data


@app.get("/api/alerts")
async def get_alerts():
    return ALERTS_FEED


@app.get("/api/approvals")
async def get_approvals():
    return APPROVAL_QUEUE


@app.post("/api/approvals/{appr_id}/action")
async def handle_approval(appr_id: str, req: ApprovalActionRequest):
    for item in APPROVAL_QUEUE:
        if item["id"] == appr_id:
            item["status"] = "approved" if req.action == "approve" else "rejected"
            item["resolved_notes"] = req.notes
            return {"status": "success", "item": item}
    raise HTTPException(status_code=404, detail="Approval item not found")


@app.get("/api/policies")
async def get_policies():
    return [
        {"rule": "R1", "name": "Suspicious Activity Verification", "route": "auto", "description": "Initiate customer verification and synthetic fraud checks when anomalies are detected."},
        {"rule": "R2", "name": "Customer Denial / Fraud Confirmation", "route": "L1 / L2", "description": "Block compromised card (L1 if <= $2,500; L2 if > $2,500). Mandate FinCEN SAR filing if exposure > $1,000."},
        {"rule": "R3", "name": "Customer Confirmation (Legitimate)", "route": "auto", "description": "Clear fraud hold, allow transaction, and close alert without customer friction."},
        {"rule": "R4", "name": "Card-Not-Present New Device", "route": "auto", "description": "Trigger Step-Up Auth / 2FA challenge when transaction occurs on previously unseen device profile."},
        {"rule": "R5", "name": "Evidence Sufficiency Check", "route": "auto", "description": "When evidence sufficiency is below 85%, decline terminal freeze and request non-destructive Step-Up auth."},
        {"rule": "R6", "name": "Syndicate / Shared Device Ring", "route": "auto / L2", "description": "Detect multi-card linkages sharing device fingerprints or mule beneficiary accounts. Place connected ring on heightened monitoring."},
        {"rule": "POL-ATO-01", "name": "Account Takeover & Device Mismatch", "route": "L1 / L2", "description": "Unregistered proxy device combined with international IP mismatch warrants immediate preventative ACH hold and L1 Team Lead review."}
    ]


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("server:app", host=host, port=port, reload=False)


