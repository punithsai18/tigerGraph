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


class SimulationRequest(BaseModel):
    case_id: str
    response_type: str  # "denied" or "confirmed"


@app.on_event("startup")
async def startup_event():
    print("[Server] Initializing TigerGraph Client and Case Memory...")
    tg_client.initialize()
    memory.initialize()
    agent.initialize()
    print("[Server] Ready to process fraud investigations.")


@app.get("/")
async def root():
    index_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="index.html not found")


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "tigergraph_mode": tg_client.mode,
        "case_memory_count": len(memory.cases),
        "devices_indexed": len(tg_client.devices)
    }


@app.get("/api/cases")
async def get_all_cases():
    """Returns list of all benchmark cases from cases/ directory or case_pack.csv."""
    results = []
    if os.path.exists(CASES_DIR):
        case_files = sorted([f for f in os.listdir(CASES_DIR) if f.endswith(".json")])
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


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
