"""
Policy-Governed Next-Best Action (NBA) Recommendation Engine
Implements Fraud Policy Version 1.0 rules (R1 to R10) and approval routes (auto, L1, L2).
Formulates initial recommendations (before evidence) and final recommendations (after evidence).
"""

from typing import Dict, Any, List, Tuple


class NBAEngine:
    """Evaluates case state and prescribes policy-compliant actions with approval routes."""

    @staticmethod
    def get_approval_route(action: str, exposure: float) -> str:
        """
        Determines the exact approval route based on action and exposure.
        auto: agent executes
        L1 (team lead): DECLINE_TRANSACTION; BLOCK_CARD when exposure <= $2,500
        L2 (fraud manager): BLOCK_CARD when exposure > $2,500; BLOCK_ALL_CARDS; FILE_REPORT
        """
        if action == "DECLINE_TRANSACTION":
            return "L1"
        elif action == "BLOCK_CARD":
            return "L2" if exposure > 2500.0 else "L1"
        elif action in ["BLOCK_ALL_CARDS", "FILE_REPORT"]:
            return "L2"
        else:
            return "auto"

    @classmethod
    def evaluate_initial(
        cls,
        trigger_type: str,
        fraud_prob: float,
        pattern: str,
        exposure: float,
        is_single_signal: bool,
        connected_cards: List[str],
        has_cleared_large_purchase: bool = False
    ) -> List[Dict[str, str]]:
        """Formulates initial actions before requested evidence returns."""
        actions = []

        if trigger_type == "customer_report":
            # Customer already reached out stating unrecognized purchase
            # If exposure or pattern warrants, check if recurring or outright denial
            actions.append({
                "action": "CREATE_CASE",
                "route": "auto",
                "reason": "R2: Customer dispute received, opening internal case record"
            })
            actions.append({
                "action": "VERIFY_WITH_CUSTOMER",
                "route": "auto",
                "reason": "R1: Re-confirm transaction details, card possession status, and travel history"
            })
            if pattern == "card_testing" or fraud_prob >= 0.70:
                actions.append({
                    "action": "DECLINE_TRANSACTION",
                    "route": "L1",
                    "reason": "R5: Testing sequence observed or high probability, decline pending authorization"
                })
        elif pattern == "card_testing":
            # Rule R5
            actions.append({
                "action": "DECLINE_TRANSACTION",
                "route": "L1",
                "reason": "R5: Testing sequence observed, declining pending authorizations"
            })
            if has_cleared_large_purchase or fraud_prob >= 0.85:
                actions.append({
                    "action": "BLOCK_CARD",
                    "route": cls.get_approval_route("BLOCK_CARD", exposure),
                    "reason": "R5: Large fraudulent purchase has already cleared following testing sequence"
                })
            else:
                actions.append({
                    "action": "STEP_UP_AUTH",
                    "route": "auto",
                    "reason": "R5: Require step-up authentication before allowing further authorizations"
                })
            actions.append({
                "action": "VERIFY_WITH_CUSTOMER",
                "route": "auto",
                "reason": "R1: Confirm whether cardholder initiated the testing sequence"
            })
        elif fraud_prob < 0.70 or is_single_signal:
            # Rule R1: Weak signal or single signal
            if fraud_prob < 0.25:
                actions.append({
                    "action": "ALLOW_TRANSACTION",
                    "route": "auto",
                    "reason": "R1: Low risk score, transaction appears consistent with customer profile"
                })
                actions.append({
                    "action": "MONITOR_CARD",
                    "route": "auto",
                    "reason": "Monitor card for 72 hours as standard precaution"
                })
            else:
                actions.append({
                    "action": "VERIFY_WITH_CUSTOMER",
                    "route": "auto",
                    "reason": "R1: Probability < 0.70 or single score signal; verify before any block"
                })
                actions.append({
                    "action": "MONITOR_CARD",
                    "route": "auto",
                    "reason": "Raise monitoring sensitivity for 72 hours pending response"
                })
        elif trigger_type == "analyst_request" or len(connected_cards) > 0:
            # Shared origin / analyst investigation
            actions.append({
                "action": "CREATE_CASE",
                "route": "auto",
                "reason": "R6: Shared device or coordinated activity identified across cards"
            })
            actions.append({
                "action": "VERIFY_WITH_CUSTOMER",
                "route": "auto",
                "reason": "R1: Validate cardholder authorization for suspicious activity"
            })
            if len(connected_cards) > 0:
                actions.append({
                    "action": "MONITOR_CONNECTED_CARDS",
                    "route": "auto",
                    "reason": "R6: Shared device profile links to other cards; monitor syndicate members"
                })
        else:
            # High probability online CNP or ATO
            actions.append({
                "action": "CREATE_CASE",
                "route": "auto",
                "reason": "Open fraud case based on elevated risk indicators"
            })
            actions.append({
                "action": "DECLINE_TRANSACTION",
                "route": "L1",
                "reason": "Decline suspicious authorization"
            })
            actions.append({
                "action": "VERIFY_WITH_CUSTOMER",
                "route": "auto",
                "reason": "R1: Verify with customer to confirm compromise"
            })

        return actions

    @classmethod
    def evaluate_final(
        cls,
        initial_actions: List[Dict[str, str]],
        verdict: str,
        fraud_prob: float,
        pattern: str,
        exposure: float,
        customer_response: str,
        connected_cards: List[str],
        is_undocumented: bool = False
    ) -> Tuple[List[Dict[str, str]], str]:
        """
        Formulates final actions after evidence (customer response, analyst info) has returned.
        Returns: (final_actions, what_changed)
        """
        final_actions = []

        if verdict == "legitimate" or "confirm" in customer_response.lower():
            # Rule R3: Customer confirms transaction
            final_actions.append({
                "action": "ALLOW_TRANSACTION",
                "route": "auto",
                "reason": "R3: Customer confirmed transaction as legitimate"
            })
            final_actions.append({
                "action": "CLOSE_NO_FRAUD",
                "route": "auto",
                "reason": "R3: Cardholder confirmed activity; alert closed as false alarm"
            })
            what_changed = "Customer confirmed the transaction. Initial verification or monitoring actions updated to ALLOW_TRANSACTION and CLOSE_NO_FRAUD."
            return final_actions, what_changed

        if verdict == "uncertain":
            # Rule R8: Escalate when uncertain and exposed
            final_actions.append({
                "action": "CREATE_CASE",
                "route": "auto",
                "reason": "Maintain internal case record of unresolved alert"
            })
            final_actions.append({
                "action": "MONITOR_CARD",
                "route": "auto",
                "reason": "R4: Card maintained under enhanced monitoring"
            })
            if exposure > 500.0:
                final_actions.append({
                    "action": "ESCALATE_TO_ANALYST",
                    "route": "auto",
                    "reason": "R8: Verdict is uncertain and exposure > $500; escalated to senior fraud analyst"
                })
            what_changed = "Evidence remained ambiguous. Actions focused on monitoring and senior analyst escalation under R8."
            return final_actions, what_changed

        # Confirmed Fraud (Customer denied or strong multi-signal fraud)
        # Rule R2: Customer denies transaction
        final_actions.append({
            "action": "BLOCK_CARD",
            "route": cls.get_approval_route("BLOCK_CARD", exposure),
            "reason": f"R2: Cardholder denied transaction; card compromised (exposure ${exposure:.2f})"
        })
        final_actions.append({
            "action": "CREATE_CASE",
            "route": "auto",
            "reason": "R2: Formal fraud case created with forensic evidence"
        })

        # Check for SAR Filing: exposure > $1,000 OR shared device / ring OR undocumented pattern (R6, R9, 3a)
        needs_sar = (exposure > 1000.0) or (len(connected_cards) > 0) or is_undocumented
        if needs_sar:
            reason = "R2 & 3a: Exposure exceeds $1,000 regulatory threshold"
            if len(connected_cards) > 0:
                reason = "R6: Compromised card connected to shared device profile across multiple cards"
            elif is_undocumented:
                reason = "R9: Coordinated syndicate activity fitting undocumented typology"

            final_actions.append({
                "action": "FILE_REPORT",
                "route": "L2",
                "reason": reason
            })

        # Connected Cards Monitoring (Rule R6)
        if len(connected_cards) > 0:
            final_actions.append({
                "action": "MONITOR_CONNECTED_CARDS",
                "route": "auto",
                "reason": f"R6: Shared device profile links to {len(connected_cards)} other card(s)"
            })

        what_changed = (
            f"Cardholder denial confirmed compromise, elevating fraud probability to {fraud_prob:.2f}. "
            f"Actions progressed from verification to BLOCK_CARD and CREATE_CASE"
            + (", with FILE_REPORT filed due to regulatory policy thresholds." if needs_sar else ".")
        )

        return final_actions, what_changed
