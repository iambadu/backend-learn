# Module Exam — 01: Internet & Networking

Cumulative test across all of Module 1 (Lessons 1–9). No answer key lives in this file — this is worked through in conversation (say `Exam` and reference this file, or paste a section) so answers get evaluated and gaps get targeted follow-up, per the mastery system in `PROGRESS.md`. Passing means mastery level 5+ (Reasoning — trade-offs and failure modes explained correctly, not just terms recognized) on every section below.

---

## Section A — Recall & mechanism (targets mastery levels 1–3)

1. Name the four components of end-to-end packet delay and which one bandwidth directly affects.
2. What does the TCP three-way handshake accomplish, and how many RTTs does it cost before application data can flow?
3. What's the difference between what an IP address identifies and what a port identifies?
4. Name the TLS 1.3 key-schedule secrets in order (Early → Handshake → Master) and what new input each stage consumes.
5. What does HPACK's static table vs. dynamic table each provide?
6. What problem does the TCP Window Scale option (RFC 7323) solve, and what's the 16-bit limitation it works around?

## Section B — Explain in your own words (targets mastery level 2, checked for precision not just fluency)

7. Explain why a router doesn't need to know the full path to a packet's destination.
8. Explain, precisely, the difference between TCP head-of-line blocking (which HTTP/2 inherits) and application-level head-of-line blocking (which HTTP/2 fixes).
9. Explain forward secrecy in terms of what TLS 1.3 removed from TLS 1.2, and what an attacker who steals your server's certificate private key can and can't do as a result.
10. Explain the mechanical difference between how CUBIC and BBR decide to slow down.

## Section C — Scenario diagnosis (targets mastery levels 3–4: application and debugging)

11. A load-test shows your API's throughput plateaus well below your server's actual available bandwidth, on a connection between two data centers with ~120ms RTT. Walk through your diagnostic process using this module's content — what's your first hypothesis, and how would you confirm or rule it out?
12. Users on mobile networks report your API "hangs" intermittently, while desktop users on the same account see no issue. Your API is served over HTTP/2. Propose the most likely mechanism, and a concrete architectural change that would address it.
13. Your monitoring shows a sudden spike in DNS resolution time coinciding with a spike in overall request latency, but your servers' CPU/processing metrics look completely normal. What's your hypothesis about where the actual problem lives, and what would you check next?
14. A teammate wants to add a `GET /api/generate-report` endpoint that kicks off a 30-second report-generation job as a side effect. Using Section on HTTP semantics, name every category of infrastructure that will misbehave because of this, and why.

## Section D — Trade-off reasoning (targets mastery level 5 — the actual bar for "mastered")

15. Defend a decision to *not* adopt HTTP/3 for a given API's public traffic, given a stated set of constraints (you'll be given specifics in conversation) — argue the case honestly, not just list HTTP/3's downsides.
16. A colleague proposes lowering your DNS TTL from 3600s to 30s "to make deployments safer." Argue both sides of this concretely, in terms of what it actually buys and costs.
17. Compare L4 and L7 load balancing not by listing their features, but by explaining why a real production system would want *both*, layered, rather than picking one.
18. Explain why "add more bandwidth" is sometimes completely the wrong fix for a latency complaint — give a concrete scenario where it would do nothing at all.

## Section E — System design (targets mastery level 6 — synthesis across the whole module)

19. Design the network-facing tier (DNS, TLS termination point, load balancer layer(s), protocol support) for a public API that: serves a global user base including significant mobile/high-latency-network traffic, has both a high-volume read path and a low-volume, latency-tolerant write path, and needs to support a zero-downtime migration to new backend infrastructure at some point. Justify every choice against a concept from Lessons 1–9 — no choice should be unjustified "best practice" without a stated mechanical reason.

## Section F — Debug (targets mastery level 4, given broken artifacts)

20. You'll be handed a `curl -v` trace and a `traceroute` output showing an anomaly (in conversation, not in this file). Diagnose what's wrong and which lesson's content explains the anomaly.

---

**On passing:** update `PROGRESS.md` — Module 1 status to "Complete," log per-topic mastery levels, and log any misconceptions caught during this exam (even ones you self-corrected) in the misconception log so they're eligible for spaced review later. Module 2 (Backend Fundamentals) unlocks after this.
