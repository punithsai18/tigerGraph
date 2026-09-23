"""
Strict Validator for TigerGraph Fraud Investigation Benchmark Cases
Validates all 20 output JSON files against the hackathon grading criteria and schema.
"""

import os
import sys
import json
import re
from typing import List

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

VALID_PATTERNS = {
    "card_testing", "card_not_present_fraud", "card_not_present_new_device",
    "out_of_region_use", "account_takeover", "undocumented", "none"
}

VALID_STATUSES = {"open", "closed_fraud", "closed_legitimate", "escalated"}
VALID_VERDICTS = {"fraud", "legitimate", "uncertain"}
VALID_EVIDENCE_SOURCES = {"graph", "document", "customer", "external"}
VALID_EVIDENCE_TYPES = {"customer_validation", "step_up_auth", "analyst_info"}

VALID_ACTIONS = {
    "ALLOW_TRANSACTION", "DECLINE_TRANSACTION", "MONITOR_CARD",
    "MONITOR_CONNECTED_CARDS", "WARN_CUSTOMER", "VERIFY_WITH_CUSTOMER",
    "STEP_UP_AUTH", "BLOCK_CARD", "BLOCK_ALL_CARDS", "GENERATE_REPORT",
    "CREATE_CASE", "FILE_REPORT", "ESCALATE_TO_ANALYST", "CLOSE_NO_FRAUD"
}


def validate_case_file(filepath: str) -> List[str]:
    errors = []
    fname = os.path.basename(filepath)

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return [f"{fname}: Failed to parse JSON: {e}"]

    # 1. Top-Level Fields
    req_top = ["case_id", "case", "evidence_requests", "next_best_actions", "sar", "stop_reason", "tool_calls", "tokens", "latency_s"]
    for k in req_top:
        if k not in data:
            errors.append(f"{fname}: Missing top-level field '{k}'")

    if errors:
        return errors

    # 2. Case Object
    c = data["case"]
    if c.get("status") not in VALID_STATUSES:
        errors.append(f"{fname}: Invalid case.status '{c.get('status')}'")
    if c.get("verdict") not in VALID_VERDICTS:
        errors.append(f"{fname}: Invalid case.verdict '{c.get('verdict')}'")

    prob = c.get("fraud_probability")
    if not isinstance(prob, (int, float)) or not (0.0 <= prob <= 1.0):
        errors.append(f"{fname}: Invalid case.fraud_probability '{prob}'")

    pat = c.get("pattern")
    if pat not in VALID_PATTERNS:
        errors.append(f"{fname}: Invalid case.pattern '{pat}'")

    if pat == "undocumented" and not c.get("pattern_description"):
        errors.append(f"{fname}: pattern_description required when pattern is 'undocumented'")

    verdict = c.get("verdict")
    affected = c.get("affected_txn_ids", [])
    exposure = c.get("exposure_usd", 0.0)

    if verdict == "legitimate":
        if affected != []:
            errors.append(f"{fname}: Legitimate verdict must have empty affected_txn_ids, found {affected}")
        if exposure != 0.0:
            errors.append(f"{fname}: Legitimate verdict must have exposure_usd == 0, found {exposure}")

    # Evidence items
    evidence = c.get("evidence", [])
    for idx, ev in enumerate(evidence):
        if ev.get("source") not in VALID_EVIDENCE_SOURCES:
            errors.append(f"{fname}: Invalid evidence[{idx}].source '{ev.get('source')}'")
        if not ev.get("claim"):
            errors.append(f"{fname}: evidence[{idx}].claim must not be empty")

    if not isinstance(c.get("similar_prior_cases"), list):
        errors.append(f"{fname}: case.similar_prior_cases must be a list")

    if not c.get("summary"):
        errors.append(f"{fname}: case.summary must not be empty")

    if not c.get("written_to_graph"):
        errors.append(f"{fname}: case.written_to_graph must be True")

    # 3. SAR Validation
    sar = data["sar"]
    sar_file = sar.get("file", False)
    final_actions = [a.get("action") for a in data["next_best_actions"].get("final", [])]

    if sar_file and "FILE_REPORT" not in final_actions:
        errors.append(f"{fname}: sar.file is True but FILE_REPORT is missing from final next_best_actions")
    if not sar_file and "FILE_REPORT" in final_actions:
        errors.append(f"{fname}: FILE_REPORT in final actions but sar.file is False")

    if sar_file:
        narrative = sar.get("narrative", "")
        sentence_count = len([s for s in narrative.split(".") if len(s.strip()) > 5])
        if not narrative or sentence_count < 6:
            errors.append(f"{fname}: SAR narrative must be a complete regulatory filing (at least 6 sentences, found {sentence_count})")
        if not sar.get("subjects") or len(sar.get("subjects", [])) == 0:
            errors.append(f"{fname}: sar.subjects must not be empty when sar.file is True")
        if sar.get("total_amount_usd", 0.0) <= 0:
            errors.append(f"{fname}: sar.total_amount_usd must be > 0 when sar.file is True")
        dates = sar.get("activity_dates", [])
        if not isinstance(dates, list) or len(dates) != 2:
            errors.append(f"{fname}: sar.activity_dates must be a list of two dates [start, end]")
    else:
        if sar.get("narrative") != "":
            errors.append(f"{fname}: sar.narrative must be empty string when sar.file is False")
        if sar.get("subjects") != []:
            errors.append(f"{fname}: sar.subjects must be empty list when sar.file is False")
        if sar.get("total_amount_usd") != 0.0 and sar.get("total_amount_usd") != 0:
            errors.append(f"{fname}: sar.total_amount_usd must be 0 when sar.file is False")
        if sar.get("activity_dates") != []:
            errors.append(f"{fname}: sar.activity_dates must be empty list when sar.file is False")

    # 4. Next-Best Actions Validation
    nba = data["next_best_actions"]
    for group_name in ["initial", "final"]:
        group = nba.get(group_name, [])
        if not isinstance(group, list) or len(group) == 0:
            errors.append(f"{fname}: next_best_actions.{group_name} must be a non-empty list")
        for a_idx, act in enumerate(group):
            action_name = act.get("action")
            route = act.get("route")
            if action_name not in VALID_ACTIONS:
                errors.append(f"{fname}: Invalid action name '{action_name}' in {group_name}[{a_idx}]")

            # Validate route policy
            if action_name == "DECLINE_TRANSACTION" and route != "L1":
                errors.append(f"{fname}: DECLINE_TRANSACTION must have route L1, got {route}")
            elif action_name == "BLOCK_ALL_CARDS" and route != "L2":
                errors.append(f"{fname}: BLOCK_ALL_CARDS must have route L2, got {route}")
            elif action_name == "FILE_REPORT" and route != "L2":
                errors.append(f"{fname}: FILE_REPORT must have route L2, got {route}")
            elif action_name == "BLOCK_CARD":
                expected_route = "L2" if exposure > 2500.0 else "L1"
                if route != expected_route:
                    errors.append(f"{fname}: BLOCK_CARD for exposure ${exposure} expected route {expected_route}, got {route}")
            elif action_name in ["ALLOW_TRANSACTION", "MONITOR_CARD", "MONITOR_CONNECTED_CARDS", "WARN_CUSTOMER", "VERIFY_WITH_CUSTOMER", "STEP_UP_AUTH", "GENERATE_REPORT", "CREATE_CASE", "ESCALATE_TO_ANALYST", "CLOSE_NO_FRAUD"]:
                if route != "auto":
                    errors.append(f"{fname}: Action '{action_name}' must have route 'auto', got '{route}'")

    return errors


def main():
    cases_dir = os.path.join(base_dir, "cases")

    if not os.path.exists(cases_dir):
        print(f"[Error] Cases directory not found: {cases_dir}")
        sys.exit(1)

    expected_cases = [f"HHG-{i:03d}.json" for i in range(1, 21)]
    missing = [c for c in expected_cases if not os.path.exists(os.path.join(cases_dir, c))]

    if missing:
        print(f"[Warning] Missing {len(missing)} case files: {missing}")

    total_checked = 0
    total_errors = 0

    print("="*80)
    print("VALIDATING BENCHMARK CASE JSON FILES (README SPECIFICATION)")
    print("="*80)

    for cfile in expected_cases:
        path = os.path.join(cases_dir, cfile)
        if not os.path.exists(path):
            continue
        total_checked += 1
        errs = validate_case_file(path)
        if errs:
            total_errors += len(errs)
            print(f"[FAIL] {cfile}:")
            for e in errs:
                print(f"  - {e}")
        else:
            print(f"[PASS] {cfile} - 100% compliant with schema and policy rules")

    print("="*80)
    if total_errors == 0 and total_checked == 20:
        print(f"ALL 20 BENCHMARK CASES PASSED VALIDATION PERFECTLY! (0 errors across {total_checked} cases)")
    else:
        print(f"Validation completed with {total_errors} errors across {total_checked} files.")
    print("="*80)


if __name__ == "__main__":
    main()
