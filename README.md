# TigerGraph Sentinel: Agentic Fraud Investigation & Next-Best Action

[![TigerGraph](https://img.shields.io/badge/Powered%20By-TigerGraph-FF6B00.svg)](https://www.tigergraph.com/)
[![GraphRAG](https://img.shields.io/badge/Architecture-GraphRAG%20%2B%20MCP-00F0FF.svg)]()
[![Compliance](https://img.shields.io/badge/Regulatory-FinCEN%20%2F%20BSA-10B981.svg)]()
[![IEEE-CIS](https://img.shields.io/badge/Benchmark-20%20Cases%20Validated-A855F7.svg)]()

> **Hacker House Goa (HHGOA) IEEE-CIS Fraud Investigation Challenge**  
> An autonomous AI Agent powered by **TigerGraph** that investigates fraud when triggered, navigates complex multi-hop entity networks, retrieves historical precedents from case memory (5,565 closed cases), calibrates uncertainty, requests policy-governed evidence, recommends Next-Best Actions (NBAs) before and after evidence, generates FinCEN-compliant Suspicious Activity Reports (SARs), writes findings back to the graph, and provides a modern Analyst Investigation Dashboard.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |           Alert Triggers              |
                      | (Risk Score, Customer Report, Analyst)|
                      +-------------------+-------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           TigerGraph Sentinel Core Agent                          |
|                                                                                   |
|  +------------------------+  +--------------------------+  +-------------------+  |
|  |  TigerGraph MCP Server |  | GraphRAG Reasoning Engine|  | Dynamic Memory    |  |
|  |  - card_window         |  | - Entity graph subgraphs |  | - 5,565 Precedents|  |
|  |  - device_neighbors    |  | - Fraud Policy (R1-R10)  |  | - Writeback Edge  |  |
|  |  - shared_entity_ring  |  | - FinCEN / FATF typologies| |   (INVOLVES/CASE) |  |
|  +------------------------+  +--------------------------+  +-------------------+  |
|                                         |                                         |
|                                         v                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                         Stateful Case Progression                           |  |
|  |  1. Hypothesis & Pattern Recognition (Testing, CNP, ATO, Syndicate Ring)    |  |
|  |  2. Initial Next-Best Action & Approval Routing (auto / L1 / L2)             |  |
|  |  3. Uncertainty Calibration & Controlled Evidence Request                   |  |
|  |  4. Evidence Assimilation & Final Defensible Next-Best Action               |  |
|  |  5. Regulatory SAR Generation (FinCEN 6-12 Sentence Narrative)             |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                               Deliverables & UI                                   |
|  - 20 Benchmark Case Answers (cases/HHG-001.json to HHG-020.json)                 |
|  - Modern Dark-Themed Web Analyst Dashboard with Force-Directed Canvas Graph     |
|  - REST API & TigerGraph Savanna Cloud Integration Scripts                       |
+-----------------------------------------------------------------------------------+
```

---

## Key Features

1. **TigerGraph Dual-Engine Integration**:
   - **Live Savanna / TG Cloud**: Complete GSQL schema (`schema.gsql`), loading jobs (`loading_job.gsql`), and parameterized queries (`queries.gsql`).
   - **Embedded High-Fidelity Graph Engine**: Built-in in-memory graph traversal with 2-hop neighbor expansions, temporal card transaction chains, and Louvain community detection for zero-dependency offline execution.
2. **TigerGraph Model Context Protocol (MCP)**:
   - Exposes graph query tools (`tg_card_window`, `tg_device_neighbors`, `tg_shared_entity_ring`, `tg_retrieve_similar_cases`, `tg_write_case_to_graph`) conforming to the official MCP specification.
3. **GraphRAG & Precedent Case Memory**:
   - Indexes **5,565 historical closed cases** (July to October 2016) with hybrid BM25 and entity matching.
   - Dynamic memory writeback: As each case is resolved, a `FraudCase` vertex is written back to the graph and immediately queryable by subsequent investigations.
4. **Policy-Governed Next-Best Actions (NBAs)**:
   - Evaluates Fraud Policy Version 1.0 rules **R1 through R10**.
   - Prescribes initial actions before evidence and final actions after evidence with approval routes:
     - `auto`: Executed autonomously by agent (`ALLOW_TRANSACTION`, `MONITOR_CARD`, `VERIFY_WITH_CUSTOMER`, `CREATE_CASE`, `CLOSE_NO_FRAUD`).
     - `L1`: Team Lead authorization (`DECLINE_TRANSACTION`, `BLOCK_CARD` $\le \$2,500$).
     - `L2`: Fraud Manager authorization (`BLOCK_CARD` $> \$2,500$, `BLOCK_ALL_CARDS`, `FILE_REPORT`).
5. **Autonomous FinCEN Regulatory SAR Generator**:
   - Generates compliant, audit-ready 6-12 sentence SAR narratives detailing **who**, **what**, **when**, **where**, **how**, and **why suspicious**, with complete subject lists, exposure totals, and date ranges.
6. **Modern Analyst Web Dashboard**:
   - Interactive force-directed canvas graph visualizer.
   - Real-time case switcher across all 20 benchmark cases.
   - Interactive evidence simulator (toggle customer denial vs confirmation to test policy updates in real time).

---

## Graph Schema

Defined in `tigergraph/schema.gsql`:

### Vertices
- `Customer`: `customer_id`, `created_at`, `risk_tier`
- `Card`: `card_id`, `card1`..`card6`, `status`
- `Transaction`: `txn_id`, `ts`, `amount`, `channel`, `product_cd`, `risk_score`, `addr1`, `addr2`
- `DeviceProfile`: Composite key (`DeviceInfo | OS | Browser | Screen`), `proxy_status`, `device_status`
- `EmailDomain`: `domain_name`
- `BillingRegion`: `region_code`, `country_code`
- `ClosedCase`: Historical case precedents (5,565 cases)
- `FraudCase`: Dynamically ingested agent cases

### Edges
- `OWNS`: `Customer` $\to$ `Card`
- `MADE`: `Card` $\to$ `Transaction`
- `FROM_DEVICE`: `Transaction` $\to$ `DeviceProfile`
- `PURCHASER_EMAIL`: `Transaction` $\to$ `EmailDomain`
- `BILLED_IN`: `Transaction` $\to$ `BillingRegion`
- `NEXT`: `Transaction` $\to$ `Transaction` (temporal sequence)
- `INVOLVES`: `Case` $\to$ `Transaction`
- `ON_CARD`: `Case` $\to$ `Card`
- `CONNECTED_TO`: `Case` $\to$ `Card`

---

## Getting Started

### 1. Installation

```bash
git clone https://github.com/your-org/tigergraph-sentinel.git
cd tigergraph-sentinel

# Install requirements
pip install fastapi uvicorn pandas pydantic pytest
```

### 2. Run All 20 Benchmark Cases

```bash
python scripts/run_benchmarks.py
```
This evaluates all 20 cases (`HHG-001` to `HHG-020`) and outputs compliant JSON files in `cases/<case_id>.json`.

### 3. Validate Output Against Strict Hackathon Rubric

```bash
python scripts/validate_cases.py
```
Validates JSON format, schema completeness, policy approval routing, valid dataset IDs, and SAR requirements.

### 4. Launch the Web Analyst Dashboard

```bash
python server.py
```
Open **`http://localhost:8000`** in your browser.

---

## Running Automated Tests

```bash
python -m pytest tests/
```
Runs test suites verifying TigerGraph queries, MCP tool handlers, pattern detectors, approval routing, and SAR narrative formatting.

---

## TigerGraph Savanna (Cloud) Setup

To connect to a live TigerGraph Savanna workspace:
1. Create a free workspace at [https://savanna.tgcloud.io](https://savanna.tgcloud.io).
2. Set environment variables:
   ```bash
   export TG_HOST="https://your-instance.i.tgcloud.io"
   export TG_USERNAME="tigergraph"
   export TG_PASSWORD="your-password"
   export TG_GRAPH_NAME="FraudInvestigationGraph"
   ```
3. Deploy the schema and queries:
   ```bash
   gsql tigergraph/schema.gsql
   gsql tigergraph/loading_job.gsql
   gsql tigergraph/queries.gsql
   ```

---

## Benchmark Evaluation Summary

| Case ID | Trigger | Assessed Pattern | Verdict | Exposure | Initial NBA | Final NBA | SAR Filed |
|---|---|---|---|---|---|---|---|
| `HHG-001` | `risk_score` | `card_testing` | `fraud` | $77.07 | `DECLINE_TRANSACTION` (L1), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-002` | `risk_score` | `card_not_present_fraud` | `fraud` | $292.36 | `VERIFY_WITH_CUSTOMER` (auto), `MONITOR_CARD` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-003` | `customer_report` | `card_not_present_fraud` | `fraud` | $49.00 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-004` | `customer_report` | `card_not_present_fraud` | `fraud` | $128.33 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-005` | `risk_score` | `none` | `legitimate` | $0.00 | `ALLOW_TRANSACTION` (auto), `MONITOR_CARD` (auto) | `ALLOW_TRANSACTION` (auto), `CLOSE_NO_FRAUD` (auto) | Exempt |
| `HHG-006` | `customer_report` | `card_not_present_fraud` | `fraud` | $482.12 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-007` | `risk_score` | `out_of_region_use` | `fraud` | $111.92 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-008` | `customer_report` | `card_not_present_fraud` | `fraud` | $55.68 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-009` | `customer_report` | `card_not_present_fraud` | `fraud` | $30.02 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-010` | `risk_score` | `card_not_present_fraud` | `fraud` | $1,000.03 | `CREATE_CASE` (auto), `DECLINE_TRANSACTION` (L1) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto), `FILE_REPORT` (L2) | **Filed (L2)** |
| `HHG-011` | `customer_report` | `card_not_present_fraud` | `fraud` | $131.30 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-012` | `risk_score` | `none` | `legitimate` | $0.00 | `VERIFY_WITH_CUSTOMER` (auto), `MONITOR_CARD` (auto) | `ALLOW_TRANSACTION` (auto), `CLOSE_NO_FRAUD` (auto) | Exempt |
| `HHG-013` | `risk_score` | `card_not_present_new_device` | `fraud` | $35.66 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-014` | `analyst_request` | `undocumented` | `fraud` | $100.00 | `CREATE_CASE` (auto), `MONITOR_CONNECTED_CARDS` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto), `FILE_REPORT` (L2), `MONITOR_CONNECTED_CARDS` (auto) | **Filed (L2)** |
| `HHG-015` | `risk_score` | `card_not_present_fraud` | `fraud` | $599.94 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-016` | `customer_report` | `card_not_present_fraud` | `fraud` | $59.67 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-017` | `risk_score` | `card_not_present_new_device` | `fraud` | $100.09 | `VERIFY_WITH_CUSTOMER` (auto), `MONITOR_CARD` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-018` | `customer_report` | `card_not_present_fraud` | `fraud` | $39.08 | `CREATE_CASE` (auto), `VERIFY_WITH_CUSTOMER` (auto) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-019` | `risk_score` | `card_not_present_new_device` | `fraud` | $99.92 | `CREATE_CASE` (auto), `DECLINE_TRANSACTION` (L1) | `BLOCK_CARD` (L1), `CREATE_CASE` (auto) | Exempt |
| `HHG-020` | `risk_score` | `none` | `legitimate` | $0.00 | `ALLOW_TRANSACTION` (auto), `MONITOR_CARD` (auto) | `ALLOW_TRANSACTION` (auto), `CLOSE_NO_FRAUD` (auto) | Exempt |

---

## Submission Checklist

- [x] Working Agent implementation (`agent/investigator.py`)
- [x] TigerGraph GSQL Schema & Queries (`tigergraph/schema.gsql`, `loading_job.gsql`, `queries.gsql`)
- [x] TigerGraph MCP Server (`mcp/tg_mcp_server.py`)
- [x] Case Memory Engine with 5,565 historical precedents (`agent/memory.py`)
- [x] Next-Best Action Engine with Policy R1–R10 and approval routing (`agent/nba_engine.py`)
- [x] FinCEN Suspicious Activity Report (SAR) Generator (`agent/sar_engine.py`)
- [x] All 20 Benchmark Case Output Files in `cases/` (`HHG-001.json` to `HHG-020.json`)
- [x] Automated Test & Validation Suite (`tests/`, `scripts/validate_cases.py`)
- [x] Modern Analyst Web Dashboard (`web/`, `server.py`)
- [x] Technical Blog Post (`BLOG_POST.md`)
- [x] Social Media Post Draft (`SOCIAL_POST.md`)
- [x] Demo Video Guide (`DEMO_GUIDE.md`)
