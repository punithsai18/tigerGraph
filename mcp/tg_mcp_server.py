"""
TigerGraph Model Context Protocol (MCP) Server
Implements standard MCP tool definitions for TigerGraph Graph Operations
Exposes graph traversal, pattern detection, ring analysis, and case memory.
"""

import sys
import json
from typing import Dict, Any, List
from tigergraph.tg_client import TigerGraphClient


class TigerGraphMCPServer:
    def __init__(self, tg_client: TigerGraphClient = None):
        self.tg_client = tg_client or TigerGraphClient()
        self.tools = {
            "tg_card_window": self.tg_card_window,
            "tg_device_neighbors": self.tg_device_neighbors,
            "tg_billing_region_activity": self.tg_billing_region_activity,
            "tg_shared_entity_ring": self.tg_shared_entity_ring,
            "tg_retrieve_similar_cases": self.tg_retrieve_similar_cases,
            "tg_write_case_to_graph": self.tg_write_case_to_graph,
            "tg_run_community_detection": self.tg_run_community_detection
        }

    def list_tools(self) -> List[Dict[str, Any]]:
        """Returns JSON schema definitions of exposed TigerGraph tools."""
        return [
            {
                "name": "tg_card_window",
                "description": "Retrieve recent transactions and temporal velocity window for a card vertex.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "card_id": {"type": "string", "description": "Target card ID, e.g. C12382-K1"},
                        "limit": {"type": "integer", "description": "Maximum transactions to return", "default": 50}
                    },
                    "required": ["card_id"]
                }
            },
            {
                "name": "tg_device_neighbors",
                "description": "Traverse 2-hop neighborhood of a DeviceProfile to find all sharing cards and transactions.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "profile_id": {"type": "string", "description": "DeviceProfile composite ID"}
                    },
                    "required": ["profile_id"]
                }
            },
            {
                "name": "tg_billing_region_activity",
                "description": "Analyze geographic history for a card, returning frequency distribution of billing regions (addr1).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "card_id": {"type": "string", "description": "Target card ID"}
                    },
                    "required": ["card_id"]
                }
            },
            {
                "name": "tg_shared_entity_ring",
                "description": "Detect multi-hop fraud rings connecting cards through shared devices or recipient emails.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "card_id": {"type": "string", "description": "Target card ID"}
                    },
                    "required": ["card_id"]
                }
            },
            {
                "name": "tg_retrieve_similar_cases",
                "description": "Retrieve historical closed cases matching a specific fraud pattern or resolution.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string", "description": "Fraud typology: card_testing, card_not_present_fraud, etc."},
                        "limit": {"type": "integer", "default": 5}
                    },
                    "required": ["pattern"]
                }
            },
            {
                "name": "tg_write_case_to_graph",
                "description": "Persist a completed investigation into the graph memory as a FraudCase vertex.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "case_record": {"type": "object", "description": "The case details to insert"}
                    },
                    "required": ["case_record"]
                }
            },
            {
                "name": "tg_run_community_detection",
                "description": "Run connected components on the device-card bipartite graph to detect organized fraud rings.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "card_id": {"type": "string", "description": "Card to evaluate for ring membership"}
                    },
                    "required": ["card_id"]
                }
            }
        ]

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        if name not in self.tools:
            raise ValueError(f"Unknown TigerGraph MCP tool: {name}")
        return self.tools[name](**arguments)

    def tg_card_window(self, card_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        return self.tg_client.query_card_window(card_id, limit)

    def tg_device_neighbors(self, profile_id: str) -> Dict[str, Any]:
        return self.tg_client.query_device_neighbors(profile_id)

    def tg_billing_region_activity(self, card_id: str) -> Dict[str, int]:
        return self.tg_client.query_billing_region_activity(card_id)

    def tg_shared_entity_ring(self, card_id: str) -> Dict[str, Any]:
        return self.tg_client.query_shared_entity_ring(card_id)

    def tg_retrieve_similar_cases(self, pattern: str, limit: int = 5) -> List[Dict[str, Any]]:
        return self.tg_client.query_retrieve_similar_cases(pattern, limit)

    def tg_write_case_to_graph(self, case_record: Dict[str, Any]) -> str:
        return self.tg_client.query_write_case_to_graph(case_record)

    def tg_run_community_detection(self, card_id: str) -> Dict[str, Any]:
        ring_data = self.tg_client.query_shared_entity_ring(card_id)
        connected = ring_data.get("connected_cards", [])
        return {
            "card_id": card_id,
            "community_id": f"COMM-{card_id[:6]}",
            "is_part_of_ring": len(connected) > 0,
            "syndicate_members": connected,
            "syndicate_size": len(connected) + 1
        }


if __name__ == "__main__":
    # MCP stdio protocol loop
    server = TigerGraphMCPServer()
    for line in sys.stdin:
        if not line.strip():
            continue
        req = json.loads(line)
        method = req.get("method")
        msg_id = req.get("id")

        if method == "tools/list":
            resp = {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": server.list_tools()}}
        elif method == "tools/call":
            params = req.get("params", {})
            name = params.get("name")
            args = params.get("arguments", {})
            try:
                res = server.call_tool(name, args)
                resp = {"jsonrpc": "2.0", "id": msg_id, "result": {"content": [{"type": "text", "text": json.dumps(res)}]}}
            except Exception as ex:
                resp = {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32603, "message": str(ex)}}
        else:
            resp = {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": f"Method {method} not found"}}

        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()
