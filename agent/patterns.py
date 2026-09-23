"""
Fraud Pattern Classifier & Typology Detector
Implements pattern detectors for:
- card_testing
- card_not_present_fraud
- card_not_present_new_device
- out_of_region_use
- account_takeover
- undocumented
- none
"""

from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta


class PatternDetector:
    """Analyzes transaction sequences, channel attributes, and device signals to classify fraud typologies."""

    @staticmethod
    def detect_card_testing(txns: List[Dict[str, Any]], flagged_txn_id: str) -> Tuple[bool, List[str], float]:
        """
        Pattern 1: Card testing.
        3 or more small online authorizations (often < $5) within 1-2 hours,
        followed by or accompanied by a larger purchase.
        """
        if not txns:
            return False, [], 0.0

        # Sort chronological
        sorted_txns = sorted(txns, key=lambda x: x.get("ts", ""))
        flagged_idx = -1
        for i, t in enumerate(sorted_txns):
            if str(t.get("txn_id")) == str(flagged_txn_id):
                flagged_idx = i
                break

        small_auths = []
        larger_purchases = []

        for t in sorted_txns:
            amt = float(t.get("amount", 0.0))
            ch = t.get("channel", "")
            if ch == "online" or t.get("product_cd") in ["C", "H", "R", "S"]:
                if amt <= 10.0:
                    small_auths.append(t)
                elif amt >= 30.0:
                    larger_purchases.append(t)

        if len(small_auths) >= 3 and len(larger_purchases) >= 1:
            affected = [t["txn_id"] for t in small_auths] + [t["txn_id"] for t in larger_purchases]
            # Ensure unique in order
            seen = set()
            unique_affected = []
            for tid in affected:
                if tid not in seen:
                    seen.add(tid)
                    unique_affected.append(tid)
            exposure = sum(float(t["amount"]) for t in sorted_txns if t["txn_id"] in seen)
            return True, unique_affected, exposure

        return False, [], 0.0

    @staticmethod
    def detect_out_of_region(
        txns: List[Dict[str, Any]],
        flagged_txn: Dict[str, Any],
        historical_regions: Dict[str, int]
    ) -> Tuple[bool, List[str], float]:
        """
        Pattern 4: Out-of-region use.
        Card-present purchases (channel == 'in_person' or ProductCD == 'W') in a billing region
        the cardholder has no history in, while normal activity continues at home.
        """
        flagged_region = str(flagged_txn.get("addr1", ""))
        ch = flagged_txn.get("channel", "")

        # If card-present and region has never been seen in history or very low frequency
        if ch == "in_person" or flagged_txn.get("product_cd") == "W":
            prior_count = historical_regions.get(flagged_region, 0)
            # If region count is <= 2 out of all transactions
            total_history = sum(historical_regions.values())
            if total_history > 5 and prior_count <= 2:
                affected = [flagged_txn["txn_id"]]
                exposure = float(flagged_txn.get("amount", 0.0))
                return True, affected, exposure

        return False, [], 0.0

    @staticmethod
    def detect_new_device(
        flagged_txn: Dict[str, Any],
        device_profile: Dict[str, Any],
        connected_cards: List[str]
    ) -> Tuple[bool, str]:
        """
        Checks if transaction is from a New device or shared device profile.
        """
        dev_status = device_profile.get("device_status", "")
        proxy = device_profile.get("proxy_status", "")
        is_new = (dev_status == "New" or proxy in ["anonymous", "hidden"] or len(connected_cards) > 0)
        return is_new, dev_status

    @staticmethod
    def detect_account_takeover(
        txns: List[Dict[str, Any]],
        flagged_txn: Dict[str, Any],
        device_profile: Dict[str, Any]
    ) -> Tuple[bool, List[str], float]:
        """
        Pattern 5: Account takeover.
        Mixed-channel activity inconsistent with cardholder; sudden changes in device,
        high amounts, rapid succession.
        """
        channels = {t.get("channel", "") for t in txns}
        has_mixed_channels = len(channels) > 1

        dev_status = device_profile.get("device_status", "")
        amt = float(flagged_txn.get("amount", 0.0))

        if has_mixed_channels and (dev_status == "New" or amt > 500.0):
            affected = [flagged_txn["txn_id"]]
            exposure = amt
            return True, affected, exposure

        return False, [], 0.0
