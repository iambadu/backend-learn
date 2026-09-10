# Module Exam — 10: Reliability & Observability

Cumulative test across Lessons 1–4. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. Explain what each of the three observability pillars is optimized for.
2. Distinguish liveness and readiness checks precisely.
3. Define SLI, SLO, SLA, and error budget, and derive an error budget from a stated SLO and request volume.
4. Distinguish symptom-based and cause-based alerting, and state which should generally page a human.
5. Distinguish fault tolerance from graceful degradation.
6. Explain adaptive load shedding and its connection to SLO burn rate.

## Section B — Explain in your own words

7. Explain why 100% uptime is the wrong default target, using the diminishing-returns argument.
8. Explain why a blameless postmortem is a mechanical necessity for organizational learning, not just culture.
9. Explain why an untested DR plan's RTO should be treated as unknown.

## Section C — Scenario diagnosis

10. A service's `/health` endpoint returns 200 while it's actively failing every real request because its database connection pool is exhausted. Diagnose using this module's content.
11. An on-call team is paged 40 times a day, mostly for CPU/memory threshold breaches with no user impact, and has started ignoring pages. Diagnose and redesign the alerting strategy.
12. A production incident is resolved by an engineer improvising a live code change under pressure, because no pre-built mitigation existed. Diagnose the systemic gap and propose a fix.

## Section D — Trade-off reasoning

13. Argue for a stricter SLO on Project 2's payment path versus a looser one on its reporting dashboard, using Lesson 2's cost/benefit content.
14. Defend a specific load-shedding priority order for a described multi-feature system (given in conversation) under extreme load.

## Section E — System design

15. Design Project 2's complete reliability architecture: observability instrumentation (Lesson 1), SLIs/SLOs/error budgets per critical path (Lesson 2), alerting strategy (Lesson 3), and graceful-degradation/capacity plan (Lesson 4) — justified against this module's content throughout.

---

**On passing:** update `PROGRESS.md` — Module 10 complete, log mastery levels. Module 11 (Security) unlocks next.
