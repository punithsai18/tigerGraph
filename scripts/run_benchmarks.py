"""
Benchmark Runner for Hacker House Goa (HHGOA) IEEE-CIS Cases
Runs the Fraud Investigation Agent across all 20 exam cases in case_pack.csv
and outputs compliant JSON files in cases/<case_id>.json
"""

import os
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

import json
import pandas as pd
from agent.investigator import FraudInvestigationAgent
from tigergraph.tg_client import TigerGraphClient
from agent.memory import CaseMemory


def main():
    data_dir = os.path.join(base_dir, "data")
    cases_output_dir = os.path.join(base_dir, "cases")
    os.makedirs(cases_output_dir, exist_ok=True)

    case_pack_path = os.path.join(data_dir, "case_pack.csv")
    if not os.path.exists(case_pack_path):
        print(f"[Error] {case_pack_path} not found!")
        return

    df_cases = pd.read_csv(case_pack_path, dtype=str)
    print(f"Loaded {len(df_cases)} benchmark cases from {case_pack_path}.")

    print("Initializing TigerGraph Client and Case Memory...")
    tg_client = TigerGraphClient(mode="embedded", data_dir=data_dir)
    tg_client.initialize()

    memory = CaseMemory(data_dir=data_dir)
    memory.initialize()

    agent = FraudInvestigationAgent(tg_client=tg_client, memory=memory)
    agent.initialize()

    results = []

    print("\n" + "="*80)
    print("STARTING BENCHMARK INVESTIGATION PIPELINE (20 CASES)")
    print("="*80)

    for idx, row in df_cases.iterrows():
        case_id = str(row["case_id"])
        print(f"\n--- Investigating Case {idx+1}/{len(df_cases)}: {case_id} ---")
        print(f"Trigger: {row.get('trigger_type')} | Card: {row.get('card_id')} | Flagged Txn: {row.get('flagged_txn_id')}")

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

        investigation_result = agent.investigate_case(case_meta)
        results.append(investigation_result)

        output_file = os.path.join(cases_output_dir, f"{case_id}.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(investigation_result, f, indent=2)

        verdict = investigation_result["case"]["verdict"]
        pattern = investigation_result["case"]["pattern"]
        exposure = investigation_result["case"]["exposure_usd"]
        sar_file = investigation_result["sar"]["file"]
        n_initial = len(investigation_result["next_best_actions"]["initial"])
        n_final = len(investigation_result["next_best_actions"]["final"])

        print(f"Verdict: {verdict.upper()} | Pattern: {pattern} | Exposure: ${exposure:,.2f}")
        print(f"SAR Filed: {sar_file} | NBAs: {n_initial} Initial -> {n_final} Final")
        print(f"Saved: {output_file}")

    print("\n" + "="*80)
    print(f"BENCHMARK COMPLETED: All {len(results)} cases successfully generated in {cases_output_dir}!")
    print("="*80)


if __name__ == "__main__":
    main()
