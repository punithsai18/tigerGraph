"""
Unit tests for TigerGraph Client, GSQL Queries, and MCP Server
"""

import os
import pytest
from tigergraph.tg_client import TigerGraphClient
from mcp.tg_mcp_server import TigerGraphMCPServer


@pytest.fixture(scope="module")
def tg_client():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data")
    client = TigerGraphClient(mode="embedded", data_dir=data_dir)
    client.initialize()
    return client


def test_tg_client_initialization(tg_client):
    assert tg_client._initialized is True
    # Verify closed cases history was loaded (5,565 cases)
    assert len(tg_client.closed_cases) > 5000
    # Verify identity records were loaded
    assert len(tg_client.devices) > 0


def test_tg_device_neighbors(tg_client):
    # Find any device profile
    if tg_client.devices:
        sample_profile = list(tg_client.devices.keys())[0]
        neighbors = tg_client.query_device_neighbors(sample_profile)
        assert "profile_id" in neighbors
        assert "connected_cards" in neighbors
        assert "txn_count" in neighbors


def test_tg_write_case_to_graph(tg_client):
    case_record = {
        "case_id": "TEST-001",
        "card_id": "C99999-K1",
        "customer_id": "C99999",
        "status": "closed_fraud",
        "verdict": "fraud",
        "fraud_probability": 0.89,
        "pattern": "card_testing",
        "exposure_usd": 150.0,
        "summary": "Test fraud case."
    }
    graph_id = tg_client.query_write_case_to_graph(case_record)
    assert graph_id == "TG-CASE-TEST-001"
    assert "TG-CASE-TEST-001" in tg_client.fraud_cases


def test_mcp_server_tool_listing(tg_client):
    mcp_server = TigerGraphMCPServer(tg_client)
    tools = mcp_server.list_tools()
    tool_names = [t["name"] for t in tools]
    assert "tg_card_window" in tool_names
    assert "tg_device_neighbors" in tool_names
    assert "tg_shared_entity_ring" in tool_names
    assert "tg_retrieve_similar_cases" in tool_names
    assert "tg_write_case_to_graph" in tool_names
