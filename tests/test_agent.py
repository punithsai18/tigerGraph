"""
Unit tests for Agentic Fraud Investigation, NBA Engine, and SAR Engine
"""

import os
import pytest
from agent.investigator import FraudInvestigationAgent
from agent.patterns import PatternDetector
from agent.nba_engine import NBAEngine
from agent.sar_engine import SAREngine


def test_pattern_detection_card_testing():
    txns = [
        {"txn_id": "T1", "amount": 1.50, "channel": "online", "ts": "2016-12-01 10:00:00"},
        {"txn_id": "T2", "amount": 2.10, "channel": "online", "ts": "2016-12-01 10:15:00"},
        {"txn_id": "T3", "amount": 0.99, "channel": "online", "ts": "2016-12-01 10:25:00"},
        {"txn_id": "T4", "amount": 250.00, "channel": "online", "ts": "2016-12-01 10:45:00"}
    ]
    detected, affected, exposure = PatternDetector.detect_card_testing(txns, "T4")
    assert detected is True
    assert len(affected) == 4
    assert exposure == 254.59


def test_nba_approval_routes():
    # DECLINE_TRANSACTION must always be L1
    assert NBAEngine.get_approval_route("DECLINE_TRANSACTION", 100.0) == "L1"

    # BLOCK_CARD <= $2500 is L1, > $2500 is L2
    assert NBAEngine.get_approval_route("BLOCK_CARD", 1500.0) == "L1"
    assert NBAEngine.get_approval_route("BLOCK_CARD", 3500.0) == "L2"

    # FILE_REPORT and BLOCK_ALL_CARDS must always be L2
    assert NBAEngine.get_approval_route("FILE_REPORT", 500.0) == "L2"
    assert NBAEngine.get_approval_route("BLOCK_ALL_CARDS", 500.0) == "L2"

    # Auto actions
    assert NBAEngine.get_approval_route("VERIFY_WITH_CUSTOMER", 100.0) == "auto"
    assert NBAEngine.get_approval_route("ALLOW_TRANSACTION", 100.0) == "auto"
    assert NBAEngine.get_approval_route("CREATE_CASE", 100.0) == "auto"


def test_sar_generation():
    affected = [
        {"txn_id": "3514030", "amount": 77.07, "channel": "online", "ts": "2016-12-05 01:55:28"}
    ]
    sar = SAREngine.generate(
        should_file=True,
        case_id="HHG-001",
        customer_id="C12382",
        card_id="C12382-K1",
        pattern="card_testing",
        affected_txns=affected,
        connected_cards=["C11891-K1"],
        device_profile="SAMSUNG SM-G892A | Android 7.0",
        reason="R2 & 3a: Testing sequence confirmed by customer denial"
    )

    assert sar["file"] is True
    assert "C12382" in sar["subjects"]
    assert "C12382-K1" in sar["subjects"]
    assert sar["total_amount_usd"] == 77.07
    assert len(sar["activity_dates"]) == 2
    # Narrative must be comprehensive (at least 6 sentences)
    sentences = [s for s in sar["narrative"].split(".") if len(s.strip()) > 5]
    assert len(sentences) >= 6
