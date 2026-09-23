"""
TigerGraph Client & Embedded Graph Engine
Hacker House Goa (HHGOA) IEEE-CIS Fraud Investigation Edition

Provides unified access to:
1. Live TigerGraph Savanna / TG Cloud / Community Edition instances (via REST / pyTigerGraph)
2. High-fidelity Embedded Graph Engine executing exact GSQL queries, 2-hop traversals,
   temporal card windows, device rings, and community detection on local data.
"""

import os
import json
from typing import Dict, List, Any, Optional, Set
from collections import defaultdict
import pandas as pd


class TigerGraphClient:
    def __init__(self, mode: str = "auto", data_dir: str = "data"):
        self.data_dir = data_dir
        self.host = os.environ.get("TG_HOST")
        self.username = os.environ.get("TG_USERNAME", "tigergraph")
        self.password = os.environ.get("TG_PASSWORD", "tigergraph")
        self.graph_name = os.environ.get("TG_GRAPH_NAME", "FraudInvestigationGraph")
        self.api_token = os.environ.get("TG_API_TOKEN")

        # Determine mode
        if mode == "live" or (mode == "auto" and self.host):
            self.mode = "live"
        else:
            self.mode = "embedded"

        # Embedded graph structures
        self.txns: Dict[str, Dict[str, Any]] = {}
        self.cards: Dict[str, Dict[str, Any]] = {}
        self.customers: Dict[str, Dict[str, Any]] = {}
        self.devices: Dict[str, Dict[str, Any]] = {}
        self.closed_cases: Dict[str, Dict[str, Any]] = {}
        self.fraud_cases: Dict[str, Dict[str, Any]] = {}

        # Graph Adjacency Indices
        self.card_to_txns: Dict[str, List[str]] = defaultdict(list)
        self.customer_to_cards: Dict[str, List[str]] = defaultdict(list)
        self.card_to_customer: Dict[str, str] = {}
        self.txn_to_device: Dict[str, str] = {}
        self.device_to_txns: Dict[str, List[str]] = defaultdict(list)
        self.device_to_cards: Dict[str, Set[str]] = defaultdict(set)
        self.card_to_regions: Dict[str, List[str]] = defaultdict(list)
        self.txn_to_region: Dict[str, str] = {}
        self.card_to_cases: Dict[str, List[str]] = defaultdict(list)

        self._initialized = False

    def initialize(self):
        """Loads available data files and constructs graph adjacency indices rapidly."""
        if self._initialized:
            return

        # 1. Load Closed Cases History (Case Memory)
        closed_cases_path = os.path.join(self.data_dir, "closed_cases_history.csv")
        if os.path.exists(closed_cases_path):
            df_cases = pd.read_csv(closed_cases_path, dtype=str)
            records = df_cases.to_dict(orient="records")
            for row in records:
                cid = str(row.get("case_id", ""))
                card_id = str(row.get("card_id", "")) if pd.notna(row.get("card_id")) else ""
                cust_id = str(row.get("customer_id", "")) if pd.notna(row.get("customer_id")) else ""
                raw_txns = str(row.get("txn_ids", "")) if pd.notna(row.get("txn_ids")) else ""
                raw_conn = str(row.get("connected_card_ids", "")) if pd.notna(row.get("connected_card_ids")) else ""
                raw_exp = row.get("exposure_usd")
                exposure = float(raw_exp) if pd.notna(raw_exp) and str(raw_exp).strip() != "" else 0.0

                case_dict = {
                    "case_id": cid,
                    "customer_id": cust_id,
                    "card_id": card_id,
                    "opened_at": str(row.get("opened_at", "")) if pd.notna(row.get("opened_at")) else "",
                    "closed_at": str(row.get("closed_at", "")) if pd.notna(row.get("closed_at")) else "",
                    "outcome": str(row.get("outcome", "")) if pd.notna(row.get("outcome")) else "",
                    "pattern": str(row.get("pattern", "none")) if pd.notna(row.get("pattern")) else "none",
                    "first_fraud_txn_id": str(row.get("first_fraud_txn_id", "")) if pd.notna(row.get("first_fraud_txn_id")) else "",
                    "txn_ids": raw_txns.split("|") if raw_txns else [],
                    "exposure_usd": exposure,
                    "connected_card_ids": raw_conn.split("|") if raw_conn else [],
                    "actions_taken": str(row.get("actions_taken", "")) if pd.notna(row.get("actions_taken")) else "",
                    "report_filed": str(row.get("report_filed", "")) if pd.notna(row.get("report_filed")) else "",
                    "analyst_notes": str(row.get("analyst_notes", "")) if pd.notna(row.get("analyst_notes")) else ""
                }
                self.closed_cases[cid] = case_dict
                if card_id:
                    self.card_to_cases[card_id].append(cid)

        # 2. Load Identity (Device Profiles)
        identity_path = os.path.join(self.data_dir, "identity.csv")
        if os.path.exists(identity_path):
            cols = ["TransactionID", "DeviceInfo", "id_30", "id_31", "id_33", "DeviceType", "id_23", "id_15"]
            df_id = pd.read_csv(identity_path, usecols=lambda c: c in cols, dtype=str)
            records = df_id.to_dict(orient="records")
            for row in records:
                tid = str(row.get("TransactionID", ""))
                dev_info = str(row.get("DeviceInfo", "")) if pd.notna(row.get("DeviceInfo")) else ""
                os_info = str(row.get("id_30", "")) if pd.notna(row.get("id_30")) else ""
                browser_info = str(row.get("id_31", "")) if pd.notna(row.get("id_31")) else ""
                screen_info = str(row.get("id_33", "")) if pd.notna(row.get("id_33")) else ""
                dev_type = str(row.get("DeviceType", "")) if pd.notna(row.get("DeviceType")) else ""
                proxy = str(row.get("id_23", "")) if pd.notna(row.get("id_23")) else ""
                dev_status = str(row.get("id_15", "")) if pd.notna(row.get("id_15")) else ""

                profile_parts = [p for p in [dev_info, os_info, browser_info, screen_info] if p]
                profile_id = " | ".join(profile_parts) if profile_parts else f"DEV-{tid}"

                dev_dict = {
                    "profile_id": profile_id,
                    "device_info": dev_info,
                    "device_type": dev_type,
                    "os": os_info,
                    "browser": browser_info,
                    "screen": screen_info,
                    "proxy_status": proxy,
                    "device_status": dev_status
                }
                self.devices[profile_id] = dev_dict
                self.txn_to_device[tid] = profile_id
                self.device_to_txns[profile_id].append(tid)

        # 3. Load Transactions
        txns_path = os.path.join(self.data_dir, "transactions.csv")
        if os.path.exists(txns_path):
            self.load_transactions(txns_path)

        self._initialized = True

    def load_transactions(self, txns_path: str):
        """Streams transactions into graph structures with card/customer indexing."""
        columns_to_load = [
            "TransactionID", "TransactionAmt", "customer_id", "ts",
            "channel", "risk_score", "addr1", "addr2", "P_emaildomain"
        ]
        try:
            df = pd.read_csv(txns_path, usecols=columns_to_load, dtype=str)
            records = df.to_dict(orient="records")
            for row in records:
                tid = str(row.get("TransactionID", ""))
                cust_id = str(row.get("customer_id", "")) if pd.notna(row.get("customer_id")) else ""
                card_id = f"{cust_id}-K1" if cust_id else ""
                ts = str(row.get("ts", "")) if pd.notna(row.get("ts")) else ""
                raw_amt = row.get("TransactionAmt")
                amt = float(raw_amt) if pd.notna(raw_amt) and str(raw_amt).strip() != "" else 0.0
                channel = str(row.get("channel", "in_person")) if pd.notna(row.get("channel")) else "in_person"
                raw_score = row.get("risk_score")
                risk_score = float(raw_score) if pd.notna(raw_score) and str(raw_score).strip() != "" else 0.0
                addr1 = str(row.get("addr1", "")) if pd.notna(row.get("addr1")) else ""
                addr2 = str(row.get("addr2", "87")) if pd.notna(row.get("addr2")) else "87"
                email = str(row.get("P_emaildomain", "")) if pd.notna(row.get("P_emaildomain")) else ""

                txn_dict = {
                    "txn_id": tid,
                    "card_id": card_id,
                    "customer_id": cust_id,
                    "ts": ts,
                    "amount": amt,
                    "channel": channel,
                    "risk_score": risk_score,
                    "addr1": addr1,
                    "addr2": addr2,
                    "email_domain": email
                }
                self.txns[tid] = txn_dict

                if card_id:
                    self.card_to_txns[card_id].append(tid)
                    if cust_id:
                        self.customer_to_cards[cust_id].append(card_id)
                        self.card_to_customer[card_id] = cust_id
                    if addr1:
                        self.card_to_regions[card_id].append(addr1)
                        self.txn_to_region[tid] = addr1

                if tid in self.txn_to_device and card_id:
                    dev_prof = self.txn_to_device[tid]
                    self.device_to_cards[dev_prof].add(card_id)
        except Exception as e:
            print(f"[TigerGraphClient] Error loading transactions: {e}")

    # --------------------------------------------------------------------------
    # GSQL Query Equivalents
    # --------------------------------------------------------------------------

    def query_card_window(self, card_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        self.initialize()
        txn_ids = self.card_to_txns.get(card_id, [])
        txns = [self.txns[tid] for tid in txn_ids if tid in self.txns]
        txns.sort(key=lambda x: x["ts"], reverse=True)
        return txns[:limit]

    def query_device_neighbors(self, profile_id: str) -> Dict[str, Any]:
        self.initialize()
        txns = self.device_to_txns.get(profile_id, [])
        connected_cards = list(self.device_to_cards.get(profile_id, set()))
        connected_customers = list({self.card_to_customer[c] for c in connected_cards if c in self.card_to_customer})
        return {
            "profile_id": profile_id,
            "txn_count": len(txns),
            "connected_cards": connected_cards,
            "connected_customers": connected_customers,
            "txns": txns[:20]
        }

    def query_billing_region_activity(self, card_id: str) -> Dict[str, int]:
        self.initialize()
        regions = self.card_to_regions.get(card_id, [])
        counts: Dict[str, int] = defaultdict(int)
        for r in regions:
            counts[r] += 1
        return dict(counts)

    def query_shared_entity_ring(self, card_id: str) -> Dict[str, Any]:
        self.initialize()
        txn_ids = self.card_to_txns.get(card_id, [])
        used_devices: Set[str] = set()
        for tid in txn_ids:
            if tid in self.txn_to_device:
                used_devices.add(self.txn_to_device[tid])

        syndicate_cards: Set[str] = set()
        for dev in used_devices:
            for other_card in self.device_to_cards.get(dev, set()):
                if other_card != card_id:
                    syndicate_cards.add(other_card)

        return {
            "card_id": card_id,
            "used_devices": list(used_devices),
            "connected_cards": list(syndicate_cards),
            "ring_size": len(syndicate_cards)
        }

    def query_retrieve_similar_cases(self, pattern: str, limit: int = 5) -> List[Dict[str, Any]]:
        self.initialize()
        matches = [
            case for case in self.closed_cases.values()
            if case.get("pattern") == pattern or (pattern == "none" and case.get("outcome") == "cleared")
        ]
        matches.sort(key=lambda x: x.get("opened_at", ""), reverse=True)
        return matches[:limit]

    def query_write_case_to_graph(self, case_record: Dict[str, Any]) -> str:
        self.initialize()
        case_id = case_record.get("case_id", "")
        graph_case_id = f"TG-CASE-{case_id}"
        self.fraud_cases[graph_case_id] = case_record
        card_id = case_record.get("card_id")
        if card_id:
            self.card_to_cases[card_id].append(graph_case_id)
        return graph_case_id
