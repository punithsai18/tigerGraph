# TigerGraph Sentinel: 3–5 Minute Demo Video Script & Walkthrough Guide

This document provides a timestamped, professional demonstration script for recording the 3–5 minute demo video for the **Hacker House Goa (HHGOA) IEEE-CIS Fraud Investigation Challenge**.

---

## Demo Video Overview

- **Target Duration**: 3:30 to 4:30 minutes
- **Speaker**: Team Lead / Presenter
- **Screen Layout**:
  - Web Analyst Dashboard (`http://localhost:8000`)
  - Terminal showing benchmark execution (`python scripts/run_benchmarks.py`) and validator (`python scripts/validate_cases.py`)
  - VS Code showing TigerGraph GSQL Schema & Queries (`tigergraph/schema.gsql`, `queries.gsql`)

---

## Timestamped Narration & Action Script

### Part 1: Problem Statement & Introduction (0:00 – 0:45)
- **On-Screen**: Title slide or dashboard home screen with the TigerGraph Sentinel branding.
- **Voiceover**:
  > *"Welcome everyone! Today, fraud investigation teams at financial institutions are under relentless pressure. Analysts must manually sift through transaction histories, trace money movement, connect digital device fingerprints, review compliance rules, and decide on defensible actions—often completing the review only after the money is already gone.*
  >
  > *To solve this, we built **TigerGraph Sentinel**: an autonomous AI Agent for Fraud Investigation and Next-Best Action, powered by TigerGraph, GraphRAG, and the Model Context Protocol.*
  >
  > *Let's see Sentinel in action across our interactive analyst dashboard and examine how it investigates fraud end to end."*

---

### Part 2: Architecture & TigerGraph Graph Foundation (0:45 – 1:30)
- **On-Screen**: Switch briefly to VS Code showing `tigergraph/schema.gsql` and `tigergraph/queries.gsql`, then back to the interactive canvas graph on the dashboard.
- **Voiceover**:
  > *"Under the hood, Sentinel operates on a native TigerGraph schema comprising Customers, Cards, Transactions, Billing Regions, and Device Profiles—which combine device info, OS, browser, and screen resolutions.*
  >
  > *Rather than passing raw tables to an LLM, our TigerGraph MCP Server exposes parameterized GSQL queries like `card_window`, `device_neighbors`, and `shared_entity_ring`.*
  >
  > *On the canvas here, you can see the connected graph Sentinel retrieved: the target customer, their card, the flagged transaction, and the originating device profile. As you drag nodes around, you can see how Sentinel effortlessly traverses multi-hop connections to identify shared devices and syndicate rings."*

---

### Part 3: Investigating a Fraud Case & Next-Best Action Progression (1:30 – 2:45)
- **On-Screen**: Select Case `HHG-001` or `HHG-014` in the left queue.
- **Voiceover**:
  > *"Let's examine Case HHG-001, triggered by a real-time risk score of 0.61 on transaction 3514030. Notice how Sentinel doesn't blindly trust the model score.*
  >
  > *In the evidence panel, Sentinel uncovered a card-testing sequence—small authorizations followed by a larger transaction—sharing a device profile. It also retrieved precedents from its active Case Memory of 5,565 historical closed cases.*
  >
  > *Now look at the Next-Best Action section. Sentinel works in policy-governed stages:*
  > *First, in Stage 1, before any additional evidence arrives, Sentinel follows Policy R5 to recommend `DECLINE_TRANSACTION` with an L1 Team Lead approval route, and `VERIFY_WITH_CUSTOMER`.*
  >
  > *In Stage 2, Sentinel initiates a controlled inquiry. Let's use our interactive simulation sandbox: when the cardholder confirms they possess the card and denies authorizing the charge, Sentinel assimilates this evidence.*
  >
  > *In Stage 3, the final recommendation updates immediately to `BLOCK_CARD` and `CREATE_CASE`, with the 'What Changed' banner clearly explaining the policy rationale."*

---

### Part 4: FinCEN Regulatory SAR Generation & Case Memory (2:45 – 3:45)
- **On-Screen**: Select Case `HHG-010` (exposure > $1,000) or Case `HHG-014` (syndicate ring). Highlight the FinCEN SAR panel.
- **Voiceover**:
  > *"Now let's switch to Case HHG-010, where the unauthorized exposure exceeds $1,000.*
  >
  > *Because Policy R2 and regulatory standards mandate a filing, Sentinel automatically recommends `FILE_REPORT` routed to an L2 Fraud Manager.*
  >
  > *Sentinel doesn't just check a box—it writes the entire regulatory filing! Here is the FinCEN-compliant SAR narrative: 10 structured sentences answering who, what, when, where, how, and why suspicious, along with identified subject IDs and date ranges.*
  >
  > *Finally, down in the audit footer, you can see that Sentinel performed dynamic writeback: creating a FraudCase vertex in TigerGraph with connections to the card and transactions, enriching the graph memory for future cases."*

---

### Part 5: Benchmark Evaluation on All 20 Cases & Conclusion (3:45 – 4:15)
- **On-Screen**: Terminal running `python scripts/validate_cases.py` showing all 20 benchmark cases passing with 0 errors.
- **Voiceover**:
  > *"We evaluated Sentinel across all 20 official benchmark exam cases in `case_pack.csv`. Our strict automated validator confirms 100% compliance across every single case: legitimate false alarms were cleared without customer friction, while high-risk rings and card testing sequences were blocked and reported.*
  >
  > *TigerGraph Sentinel shows how uniting graph databases, GraphRAG, and agentic workflows can transform fraud defense from reactive damage control into proactive, explainable intelligence.*
  >
  > *Thank you, and visit our GitHub repository for the full code and documentation!"*

---

## Recording Tips

1. **Resolution**: Record at 1080p (1920x1080) at 30 or 60 fps.
2. **Audio**: Use a clear microphone with background noise cancellation.
3. **Browser Zoom**: Set browser zoom to 100% or 110% so all dashboard text, graphs, and badges are legible.
4. **Interactive Demo**: Show mouse dragging on the graph canvas and clicking the "Simulate Denial" / "Simulate Confirmation" buttons to demonstrate real-time reactivity!
