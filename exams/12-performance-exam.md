# Module Exam — 12: Performance Engineering

Cumulative test across Lessons 1–4. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. Explain why averages are a poor summary statistic for latency data, and which percentile suits which purpose.
2. Compute the probability that at least one of 50 fan-out calls experiences a tail-latency event, given each call has a 2% individual tail-event rate.
3. Explain coordinated omission's mechanism and why open-loop load generation avoids it.
4. Explain why a CPU-bound request can degrade every other concurrent request on the same Node process.
5. State the correct diagnostic sequence for a slow database-backed endpoint, and where caching belongs in it.
6. Distinguish smoke, load, stress, spike, and soak tests by what each is designed to catch.

## Section B — Explain in your own words

7. Explain the difference between what a benchmark measures and what a load test measures, and why a benchmark can miss a real production bottleneck.
8. Explain how separating connection-acquisition time from query-execution time in tracing makes a specific bottleneck class diagnosable.
9. Explain what a flame graph's width and vertical stacking each represent.

## Section C — Scenario diagnosis

10. A service's p50 latency looks fine, but its p99 has quietly regressed over several deploys, unnoticed because only average latency was dashboarded. Diagnose the process gap and propose a fix.
11. A load test reports acceptable tail latency, but production traffic reveals dramatically worse p99 behavior under real load. Diagnose the likely methodology flaw.
12. A team adds a Redis cache in front of a slow query without running `EXPLAIN ANALYZE` first, and the cache masks but doesn't fix the root cause. Diagnose the process gap.
13. A stress test reveals that a service fails catastrophically rather than shedding load gracefully at high traffic. Diagnose the likely design gap, connecting to Module 10, Lesson 4.

## Section D — Trade-off reasoning

14. Argue for running a soak test before Project 2's launch, using a concrete failure mode only a soak test would catch.
15. Defend prioritizing query optimization over caching for a described slow endpoint (given in conversation), using this module's sequencing argument.

## Section E — System design

16. Design Project 2's complete performance-validation plan before launch: percentile-based SLOs (Module 10, Lesson 2, tied to Lesson 1's content here), the diagnostic workflow for any endpoint that fails its SLO under test, and the full load-testing suite (all five shapes) with what each is expected to validate.

---

**On passing:** update `PROGRESS.md` — Module 12 complete, log mastery levels. Module 13 (Advanced System Design) unlocks next — the capstone module, run primarily in System Design Mode per `README.md`.
