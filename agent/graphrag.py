"""
GraphRAG Grounding & Policy Context Synthesizer
Grounds the agent with graph subgraphs, historical precedents, and regulatory policies.
"""

from typing import Dict, Any, List


class GraphRAG:
    """Grounds agent reasoning by fusing graph structure with policy and regulatory context."""

    POLICY_RULES = {
        "R1": "R1: Verify before blocking on weak signal. If fraud probability < 0.70 or rests on a single signal, recommend VERIFY_WITH_CUSTOMER or STEP_UP_AUTH before any block.",
        "R2": "R2: Customer denies transaction. Recommend BLOCK_CARD and CREATE_CASE. Add FILE_REPORT if exposure > $1,000 or connected to shared device / another card fraud.",
        "R3": "R3: Customer confirms transaction. Recommend CLOSE_NO_FRAUD. Note confirmation in case file.",
        "R4": "R4: No reply within 24 hours. Recommend MONITOR_CARD and DECLINE_TRANSACTION for pending auths. Escalate if exposure > $500.",
        "R5": "R5: Card testing. 3+ small online authorizations (<$5) in an hour followed by a larger purchase: recommend DECLINE_TRANSACTION and STEP_UP_AUTH. If purchase >$100 already cleared, BLOCK_CARD.",
        "R6": "R6: Shared origin. When multiple cards show fraud from the same device profile, region, or recipient email, recommend CREATE_CASE, FILE_REPORT, and MONITOR_CONNECTED_CARDS.",
        "R7": "R7: Disputed but legitimate. Customer disputes charge matching recurring pattern: recommend CREATE_CASE, VERIFY_WITH_CUSTOMER, WARN_CUSTOMER. Do not block.",
        "R8": "R8: Escalate when uncertain and exposed. If verdict is uncertain and exposure > $500, or evidence conflicts: recommend ESCALATE_TO_ANALYST.",
        "R9": "R9: Undocumented patterns. Coordinated or repeated abuse fitting no known pattern: recommend CREATE_CASE, FILE_REPORT, ESCALATE_TO_ANALYST.",
        "R10": "R10: Never BLOCK_ALL_CARDS unless 2+ cards show confirmed fraud or customer credentials confirmed compromised."
    }

    REGULATORY_STANDARDS = {
        "FinCEN_SAR": "FinCEN guidance requires SAR narrative to be clear and complete: who, what, when, where, why, and how. Required when fraud is confirmed/strongly suspected and exposure > $1,000 or connected across entities.",
        "FinCEN_ATO": "FinCEN Advisory FIN-2011-A016 on Account Takeover: highlights credential stuffing, unauthorized device additions, and rapid cross-channel drain.",
        "FATF_Cyber": "FATF Cyber-Enabled Fraud: rapid movement across synthetic digital identities and automated testing sequences."
    }

    @classmethod
    def assemble_context(
        cls,
        trigger: Dict[str, Any],
        card_window: List[Dict[str, Any]],
        device_neighbors: Dict[str, Any],
        ring_data: Dict[str, Any],
        region_history: Dict[str, int],
        similar_cases: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Synthesizes structured graph context for agent evaluation."""
        return {
            "trigger": trigger,
            "graph_evidence": {
                "recent_transactions_count": len(card_window),
                "device_profile": device_neighbors.get("profile_id", "Unknown"),
                "device_shared_with_cards": device_neighbors.get("connected_cards", []),
                "connected_customers": device_neighbors.get("connected_customers", []),
                "ring_size": ring_data.get("ring_size", 0),
                "historical_billing_regions": region_history,
                "recent_transactions": card_window[:10]
            },
            "precedents": [
                {
                    "case_id": c.get("case_id"),
                    "pattern": c.get("pattern"),
                    "outcome": c.get("outcome"),
                    "actions_taken": c.get("actions_taken"),
                    "notes": c.get("analyst_notes")
                }
                for c in similar_cases
            ],
            "governing_rules": cls.POLICY_RULES,
            "regulatory_context": cls.REGULATORY_STANDARDS
        }
