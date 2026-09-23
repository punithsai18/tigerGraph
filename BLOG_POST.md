# Building TigerGraph Sentinel: An Autonomous Agent for Fraud Investigation & Next-Best Action

*By the TigerGraph Sentinel Engineering Team for the Hacker House Goa (HHGOA) IEEE-CIS Fraud Investigation Challenge*

---

## 1. Introduction: The Crisis in Modern Fraud Operations

Fraud investigation teams at top financial institutions are fighting an asymmetric war. Every second counts: when stolen credentials or card details are weaponized, fraud syndicates rapidly execute card testing sequences, card-not-present (CNP) purchases, or account takeovers (ATO) before moving on. 

Yet, traditional investigation workflows remain largely manual, siloed, and reactive:
- Analysts must manually pivot across multiple screens to inspect transaction velocity.
- They trace cross-account relationships through slow SQL joins.
- They struggle to identify shared device fingerprints across seemingly unrelated cardholders.
- They must manually consult complex fraud policy manuals to route approvals, all while attempting to draft compliant, multi-paragraph Suspicious Activity Reports (SARs) for FinCEN.

By the time human analysts piece together the evidence, **the money is already gone**.

To solve this, we built **TigerGraph Sentinel**: an autonomous, policy-governed AI Agent for fraud investigation and Next-Best Action (NBA) powered by **TigerGraph**, **GraphRAG**, and the **Model Context Protocol (MCP)**. 

In this post, we detail our system architecture, deep graph modeling, agentic reasoning pipeline, benchmark results across the 20 official exam cases, lessons learned, and future roadmap.

---

## 2. What We Built

TigerGraph Sentinel is a stateful, agentic fraud intelligence system that:
1. **Triages Multi-Source Triggers**: Reacts autonomously to real-time risk score spikes, cardholder dispute messages, or analyst forensic requests.
2. **Conducts Deep Graph Traversals**: Uses GSQL queries and TigerGraph graph algorithms to evaluate 2-hop entity neighborhoods, digital device fingerprints, geographic billing transitions, and multi-card syndicate rings.
3. **Retrieves Precedent Case Memory**: Queries an active case memory of **5,565 historical closed cases** (July to October 2016) using hybrid lexical and graph matching.
4. **Calibrates Uncertainty & Governs Controlled Actions**: Recognizes when signals are weak (under Policy R1) and issues policy-approved inquiries (such as automated customer validation or step-up authentication).
5. **Recommends & Evolves Next-Best Actions (NBAs)**: Computes initial recommendations before evidence arrives, assimilates new findings, and produces final defensible actions with correct approval routes (`auto`, `L1 Team Lead`, `L2 Fraud Manager`).
6. **Autonomously Drafts Regulatory SAR Filings**: Generates audit-ready, 6-to-12 sentence FinCEN-compliant SAR narratives answering Who, What, When, Where, How, and Why.
7. **Maintains Dynamic Case Memory**: Ingests resolved cases back into TigerGraph as new vertices and edges, enriching the knowledge graph for subsequent investigations.
8. **Presents an Interactive Web Analyst Workspace**: A responsive, dark-mode dashboard with real-time force-directed canvas graph visualization, an evidence inspector, an evidence simulation sandbox, and 1-click SAR exports.

---

## 3. System Architecture & Component Breakdown

```
                                +-------------------+
                                |   Alert Trigger   |
                                +---------+---------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        TigerGraph Sentinel Agentic Core                           |
|                                                                                   |
|    +-------------------------+            +----------------------------------+    |
|    |    TigerGraph Client    |            |         GraphRAG Engine          |    |
|    |  - Live Savanna / Cloud | <========> | - Graph Subgraph Synthesis       |    |
|    |  - Embedded High-Fi     |            | - Fraud Policy Grounding (R1-10) |    |
|    |    Graph Engine         |            | - FinCEN/FATF Typologies         |    |
|    +-------------------------+            +----------------------------------+    |
|                 ^                                           ^                     |
|                 |                                           |                     |
|                 v                                           v                     |
|    +-------------------------+            +----------------------------------+    |
|    |    TigerGraph MCP       |            |       Case Memory Engine         |    |
|    |  - tg_card_window       |            | - 5,565 Historical Precedents    |    |
|    |  - tg_device_neighbors  |            | - BM25 + Graph Entity Retrieval  |    |
|    |  - tg_shared_entity_ring|            | - Dynamic Graph Writeback        |    |
|    +-------------------------+            +----------------------------------+    |
|                                         |                                         |
|                                         v                                         |
|    +-------------------------------------------------------------------------+    |
|    |                      Investigation State Machine                        |    |
|    |  - Pattern Detection (Testing, CNP, New Device, Out-of-Region, ATO)    |    |
|    |  - Initial Next-Best Actions & Route Assignment (auto / L1 / L2)        |    |
|    |  - Controlled Evidence Ingestion (Customer Response / Step-Up Auth)     |    |
|    |  - Final Next-Best Actions & "What Changed" Synthesis                   |    |
|    |  - FinCEN Regulatory SAR Generator                                      |    |
|    +-------------------------------------------------------------------------+    |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                            Web Analyst Dashboard (UI)                             |
|  - Force-Directed Canvas Graph Explorer                                           |
|  - Real-Time Case Switcher (20 Benchmark Cases)                                   |
|  - Interactive Evidence Simulator (Test Denial vs Confirmation)                  |
|  - FinCEN SAR Inspector & Export                                                  |
+-----------------------------------------------------------------------------------+
```

---

## 4. How TigerGraph is Used

Relational databases fall apart when querying connected fraud. In tabular SQL, detecting whether five distinct cards were used on the same device across different days requires recursive self-joins across hundreds of millions of rows—a query that can take minutes or time out entirely.

TigerGraph provides the foundational computational fabric for Sentinel through three core capabilities:

### A. Expressive Graph Schema & Native Edges
In `tigergraph/schema.gsql`, we modeled the IEEE-CIS financial ecosystem:
- **Vertices**: `Customer`, `Card`, `Transaction`, `DeviceProfile` (composite of `DeviceInfo | OS | Browser | Screen`), `EmailDomain`, `BillingRegion`, `ClosedCase`, `FraudCase`.
- **Edges**: 
  - `Customer -OWNS-> Card`
  - `Card -MADE-> Transaction`
  - `Transaction -FROM_DEVICE-> DeviceProfile`
  - `Transaction -BILLED_IN-> BillingRegion`
  - `Transaction -NEXT-> Transaction` (temporal card sequence)
  - `ClosedCase -INVOLVES-> Transaction` and `ClosedCase -ON_CARD-> Card`

### B. High-Performance GSQL Parameterized Queries
We authored optimized GSQL queries that execute in sub-millisecond time:
1. `card_window`: Retrieves chronological transaction subgraphs within a target lookback window to evaluate velocity and testing anomalies.
2. `device_neighbors`: Traverses 2 hops from a `DeviceProfile` through transactions to uncover all cards sharing the same hardware footprint.
3. `billing_region_activity`: Analyzes historical frequency distributions across billing regions (`addr1`) to detect sudden out-of-region card cloning.
4. `shared_entity_ring`: Uncovers multi-hop syndicates where cards are linked across shared devices or recipient email domains.
5. `write_case_to_graph`: Ingests newly completed fraud cases as `FraudCase` vertices with `ON_CARD` and `INVOLVES` edges, creating dynamic graph memory.

### C. TigerGraph MCP (Model Context Protocol) Server
Following the open MCP standard (`mcp/tg_mcp_server.py`), we exposed TigerGraph's graph traversal tools directly to our reasoning agent. This allows the LLM to inspect entity neighbors, execute community detection, and retrieve historical case memory without writing raw database queries.

---

## 5. Agentic Capabilities: Beyond Simple LLM Wrappers

Many AI agents simply paste raw data into a prompt and ask an LLM what to do. In financial fraud investigation, that approach is catastrophic: it suffers from hallucinations, fails to calculate financial exposure accurately, ignores banking policies, and cannot route approvals.

We implemented true agentic autonomy:

### 1. Multi-Stage Stateful Workflow
The agent progresses through distinct states:
1. **Trigger Ingestion**: Extracts target entities, initial risk scores, and customer complaint text.
2. **Graph Expansion**: Fetches 2-hop connected subgraphs via TigerGraph MCP tools.
3. **Pattern Classification**: Runs algorithmic detectors for Card Testing (3+ micro auths followed by larger purchase), Out-of-Region Use, CNP from New Device, Account Takeover, or Undocumented Syndicate Rings.
4. **Precedent Retrieval**: Queries 5,565 closed cases for historical analyst notes and outcomes.
5. **Initial NBA Formulation**: Derives initial policy actions before requesting more evidence.
6. **Controlled Evidence Request**: Simulates policy-approved actions (e.g., automated customer verification or step-up authentication).
7. **Evidence Assimilation & Final NBA**: Dynamically updates fraud probability, adjusts exposure, and assigns strict approval routes (`auto`, `L1`, `L2`).
8. **SAR Generation**: Produces a comprehensive FinCEN-compliant narrative if `FILE_REPORT` is required.
9. **Graph Memory Writeback**: Stores the case vertex into TigerGraph.

### 2. Strict Policy Governance & Approval Routing
Our agent strictly adheres to Bank Fraud Policy Version 1.0:
- **R1 (Weak Signal Protection)**: Prevents premature card blocking if probability is under 0.70 or rests on a single score signal, mandating `VERIFY_WITH_CUSTOMER` or `STEP_UP_AUTH`.
- **R2 (Cardholder Denial)**: Escalates to `BLOCK_CARD` and `CREATE_CASE`, triggering `FILE_REPORT` if exposure exceeds $1,000 or connects to shared device fraud.
- **R3 (Cardholder Confirmation)**: Corrects false alarms to `ALLOW_TRANSACTION` and `CLOSE_NO_FRAUD`.
- **R5 (Card Testing)**: Identifies testing bursts, declines pending auths, and blocks if large cleared purchases occurred.
- **R6 & R9 (Syndicate Rings & Undocumented Typologies)**: Detects coordinated abuse across customers, monitoring connected cards and filing regulatory reports.
- **Approval Hierarchy**: Automatically routes actions to `auto` (autonomous execution), `L1` (team lead), or `L2` (fraud manager for high exposure or regulatory filings).

---

## 6. Evaluation: Benchmark Results on the 20 Exam Cases

We tested TigerGraph Sentinel against the **20 official benchmark cases** (`HHG-001` to `HHG-020` in `case_pack.csv`). All 20 generated JSON answer files in `cases/` were verified with our strict validator (`scripts/validate_cases.py`), achieving **100% compliance across all schema and policy criteria**:

- **No Over-Blocking**: Legitimate false alarms (such as `HHG-005`, `HHG-012`, and `HHG-020`) were correctly cleared under Policy R3/R7, with zero financial exposure and no SAR filed.
- **Syndicate Ring Detection**: Case `HHG-014` (triggered by an analyst request on a shared device profile) was correctly diagnosed as an `undocumented` multi-card syndicate, placing connected cards under monitoring (`MONITOR_CONNECTED_CARDS`) and filing an L2-approved SAR under Policy R6/R9.
- **High-Exposure Regulatory Compliance**: Case `HHG-010` ($1,000.03 online transaction) triggered mandatory SAR filing and manager (L2) approval routing.
- **Card Testing Intervention**: Cases exhibiting rapid sub-$5 authorization patterns were flagged under Policy R5, declining pending authorizations before irreversible financial loss occurred.

---

## 7. What We Learned

1. **Graph Grounding is Essential for Agent Reliability**: Passing raw transaction rows to an LLM leads to confusion and hallucinated connections. Providing structured graph subgraphs (e.g. `connected_cards: ["C11891-K1"]`, `ring_size: 2`, `historical_regions: {"444.0": 1, "123.0": 45}`) allows the agent to reason with precision.
2. **Case Memory Drastically Improves Consistency**: In financial institutions, analysts depend heavily on precedents. By indexing 5,565 historical closed cases, our agent was able to cite exact precedent case IDs (e.g., `CC-0011`, `CC-0141`), mirroring the institutional memory of a veteran fraud team.
3. **Dual-Mode Architecture Bridges Dev and Prod**: Providing both an embedded high-fidelity GSQL graph engine and live TigerGraph Savanna Cloud connectors allowed us to run instant automated regression tests locally while maintaining full cloud deployability.

---

## 8. Roadmap & Future Improvements

With additional time, we plan to expand TigerGraph Sentinel with:
1. **Streaming Real-Time Graph Ingestion**: Integrating Apache Kafka directly with TigerGraph loading jobs to process millions of transactions per second in sub-second windows.
2. **Graph Neural Networks (GNNs) for Real-Time Embeddings**: Training a Graph Convolutional Network (GCN) directly on TigerGraph to generate unsupervised node embeddings for unknown fraud ring detection.
3. **Voice AI Customer Verification**: Connecting the agent's `customer_validation` action to an automated Voice AI agent that calls the customer in real time, securely transcribes their response, and streams it back to the graph.

---

## 9. Conclusion

TigerGraph Sentinel demonstrates that autonomous AI agents, when deeply grounded in native graph databases and governed by strict policy frameworks, can transform fraud operations from slow, fragmented manual reviews into proactive, explainable, and defensible systems. 

By unifying **TigerGraph's ultra-fast graph traversals**, **GraphRAG evidence grounding**, **Model Context Protocol (MCP)**, and **FinCEN compliance**, Sentinel empowers financial institutions to stop fraud in its tracks—before the money is gone.

---
*Built with passion for Hacker House Goa 2026. Explore our code and benchmark results on GitHub!*
