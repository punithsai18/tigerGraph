"""
Case Memory & Precedent Retrieval Engine
Hacker House Goa (HHGOA) Fraud Investigation Edition

Indexes 5,565 historical closed cases from July to October 2016.
Provides hybrid semantic and graph-entity retrieval to find precedents
and dynamically updates as new cases are resolved.
"""

import os
import re
import math
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict
import pandas as pd


class CaseMemory:
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.cases: Dict[str, Dict[str, Any]] = {}
        self.pattern_index: Dict[str, List[str]] = defaultdict(list)
        self.card_index: Dict[str, List[str]] = defaultdict(list)
        self.customer_index: Dict[str, List[str]] = defaultdict(list)
        self.corpus_terms: Dict[str, Dict[str, int]] = {}
        self.doc_freq: Dict[str, int] = defaultdict(int)
        self._initialized = False

    def initialize(self):
        """Loads and indexes closed_cases_history.csv rapidly."""
        if self._initialized:
            return

        cases_path = os.path.join(self.data_dir, "closed_cases_history.csv")
        if not os.path.exists(cases_path):
            print(f"[CaseMemory] Warning: {cases_path} does not exist yet.")
            return

        df = pd.read_csv(cases_path, dtype=str)
        records = df.to_dict(orient="records")
        for row in records:
            cid = str(row.get("case_id", ""))
            card_id = str(row.get("card_id", "")) if pd.notna(row.get("card_id")) else ""
            cust_id = str(row.get("customer_id", "")) if pd.notna(row.get("customer_id")) else ""
            pattern = str(row.get("pattern", "none")) if pd.notna(row.get("pattern")) else "none"
            notes = str(row.get("analyst_notes", "")) if pd.notna(row.get("analyst_notes")) else ""
            raw_exp = row.get("exposure_usd")
            exposure = float(raw_exp) if pd.notna(raw_exp) and str(raw_exp).strip() != "" else 0.0

            case_data = {
                "case_id": cid,
                "customer_id": cust_id,
                "card_id": card_id,
                "opened_at": str(row.get("opened_at", "")) if pd.notna(row.get("opened_at")) else "",
                "closed_at": str(row.get("closed_at", "")) if pd.notna(row.get("closed_at")) else "",
                "outcome": str(row.get("outcome", "")) if pd.notna(row.get("outcome")) else "",
                "pattern": pattern,
                "exposure_usd": exposure,
                "actions_taken": str(row.get("actions_taken", "")) if pd.notna(row.get("actions_taken")) else "",
                "report_filed": str(row.get("report_filed", "")) if pd.notna(row.get("report_filed")) else "",
                "analyst_notes": notes
            }

            self.cases[cid] = case_data
            self.pattern_index[pattern].append(cid)
            if card_id:
                self.card_index[card_id].append(cid)
            if cust_id:
                self.customer_index[cust_id].append(cid)

            # Tokenize analyst notes for TF-IDF / BM25 lexical ranking
            tokens = self._tokenize(f"{pattern} {notes}")
            term_counts: Dict[str, int] = defaultdict(int)
            for t in tokens:
                term_counts[t] += 1
            self.corpus_terms[cid] = term_counts
            for t in term_counts:
                self.doc_freq[t] += 1

        self._initialized = True

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"\b[a-zA-Z0-9_\-]{3,}\b", text.lower())

    def retrieve_similar(
        self,
        pattern: str,
        query_text: str = "",
        card_id: Optional[str] = None,
        customer_id: Optional[str] = None,
        limit: int = 3
    ) -> List[str]:
        """
        Retrieves top similar prior case IDs based on pattern, entity links, and BM25 score.
        """
        self.initialize()
        if not self.cases:
            return []

        candidates: Set[str] = set()
        if customer_id and customer_id in self.customer_index:
            candidates.update(self.customer_index[customer_id])
        if card_id and card_id in self.card_index:
            candidates.update(self.card_index[card_id])

        if pattern in self.pattern_index:
            candidates.update(self.pattern_index[pattern][:150])
        elif pattern == "none" and "none" in self.pattern_index:
            candidates.update(self.pattern_index["none"][:150])

        if not candidates:
            candidates = set(list(self.cases.keys())[:100])

        query_tokens = self._tokenize(f"{pattern} {query_text}")
        if not query_tokens:
            return list(candidates)[:limit]

        scored_candidates = []
        n_docs = len(self.cases)

        for cid in candidates:
            score = 0.0
            doc_terms = self.corpus_terms.get(cid, {})
            for token in query_tokens:
                if token in doc_terms:
                    tf = doc_terms[token]
                    df = self.doc_freq.get(token, 1)
                    idf = math.log((n_docs - df + 0.5) / (df + 0.5) + 1.0)
                    score += tf * idf

            case_pat = self.cases[cid].get("pattern")
            if case_pat == pattern:
                score += 5.0
            if card_id and self.cases[cid].get("card_id") == card_id:
                score += 10.0
            if customer_id and self.cases[cid].get("customer_id") == customer_id:
                score += 8.0

            scored_candidates.append((cid, score))

        scored_candidates.sort(key=lambda x: x[1], reverse=True)
        return [cid for cid, _ in scored_candidates[:limit]]

    def get_case(self, case_id: str) -> Optional[Dict[str, Any]]:
        self.initialize()
        return self.cases.get(case_id)

    def add_resolved_case(self, case_record: Dict[str, Any]):
        self.initialize()
        cid = case_record.get("case_id", "")
        if not cid:
            return

        self.cases[cid] = case_record
        pat = case_record.get("pattern", "none")
        self.pattern_index[pat].append(cid)

        card_id = case_record.get("card_id", "")
        if card_id:
            self.card_index[card_id].append(cid)

        cust_id = case_record.get("customer_id", "")
        if cust_id:
            self.customer_index[cust_id].append(cid)

        summary = case_record.get("summary", "")
        tokens = self._tokenize(f"{pat} {summary}")
        term_counts: Dict[str, int] = defaultdict(int)
        for t in tokens:
            term_counts[t] += 1
        self.corpus_terms[cid] = term_counts
        for t in term_counts:
            self.doc_freq[t] += 1
