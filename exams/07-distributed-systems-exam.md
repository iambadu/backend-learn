# Module Exam — 07: Distributed Systems

The second-highest-leverage module in the curriculum per `ROADMAP.md`. Cumulative test across Lessons 1–8. No answer key here — worked through in conversation (`Exam` mode). Given this module's weight, don't advance to Module 8 on a shaky pass.

---

## Section A — Recall & mechanism

1. State CAP precisely, including its actual precondition, and explain why "CA systems" don't exist.
2. Explain PACELC's "else" branch and give a concrete example from earlier in this curriculum classified correctly as PACELC, not CAP.
3. Define linearizability, causal consistency, and eventual consistency precisely.
4. Explain why a majority (not unanimity) is sufficient for Raft's safety, mechanically.
5. Explain the process-pause problem that breaks Redlock, and what fencing tokens fix about it.
6. Distinguish 2PC and sagas by what each guarantees and what each risks.
7. Explain the difference between what a Lamport timestamp and a vector clock each guarantee.
8. Distinguish a timeout, a circuit breaker, and backpressure by what each specifically prevents.

## Section B — Explain in your own words

9. Explain, mechanically, why "more replicas means more consistency" is backwards.
10. Explain why no failure detector can perfectly distinguish "crashed" from "merely slow," connecting to the Two Generals Problem (Module 6).
11. Explain why a compensating transaction is not a rollback.
12. Explain the timeout-budget problem in multi-hop call chains.

## Section C — Scenario diagnosis

13. A 7-node Raft cluster splits 4/3 across a network partition. Determine which side (if either) can make progress, and why.
14. A payment-processing lock built on plain Redis SETNX/EX allows two workers to process the same payment concurrently after one worker experienced a GC pause. Diagnose using Lesson 5's content and propose the fix.
15. A saga-based checkout flow leaves a customer's payment charged but their order shown as failed, with no compensation having run. Diagnose the likely design gap.
16. A service's response times balloon during a downstream dependency's partial outage, and the service itself becomes unresponsive to unrelated requests. Diagnose using Lesson 8's content and propose a fix.

## Section D — Trade-off reasoning

17. Argue for 2PC or a saga for a described cross-service financial operation (given in conversation), citing specific availability and consistency consequences.
18. Defend a specific consistency model (from Lesson 2) for Project 2's ledger reads versus its balance-check-before-transfer operation — they may differ, and you should justify why.
19. Argue for or against building a custom failure detector versus using an existing gossip/Phi-Accrual-based system for a described cluster (given in conversation).

## Section E — System design

20. Design Project 5's (Distributed System) full resilience and consistency architecture: consistency model per data type, distributed lock strategy (if any, with correctness classification per Lesson 5), transaction strategy for cross-service operations, and timeout/circuit-breaker/backpressure design at every service boundary — justified against this module's content throughout.

---

**On passing:** update `PROGRESS.md` — Module 7 complete, log mastery levels. Module 8 (Architecture) unlocks next.
