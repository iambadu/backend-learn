# Module Exam — 09: Infrastructure

Cumulative test across Lessons 1–5. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. Distinguish a process from a thread, and explain why Postgres chose process-per-connection.
2. Explain precisely why a container starts in milliseconds while a VM takes much longer.
3. Distinguish what namespaces restrict from what cgroups restrict.
4. Distinguish rolling, blue-green, and canary deployment by risk, cost, and rollback.
5. State the approximate duty-cycle cross-over point between serverless and container cost-effectiveness.
6. Explain the Kubernetes reconciliation-loop model and how it differs from imperative command execution.

## Section B — Explain in your own words

7. Explain why a stack overflow is directly explained by this module's process-memory content.
8. Explain the real, honest security implication of containers sharing a kernel with the host.
9. Explain why a rolling deployment's mixed-version window makes Module 3, Lesson 8's Expand-Contract pattern non-negotiable.
10. Explain why pods are deliberately ephemeral and what that means for application design.

## Section C — Scenario diagnosis

11. A container without cgroup memory limits consumes all available host memory, starving unrelated containers. Diagnose and fix.
12. A serverless payment-authorization endpoint shows unpredictable latency spikes of 300ms+ under low, sporadic traffic. Diagnose and propose a fix using this module's content.
13. A Kubernetes Service exists but routes no traffic anywhere. Diagnose the likely cause.
14. A team runs a genuinely untrusted, customer-supplied script inside a plain Docker container as part of a SaaS feature. Evaluate the isolation risk using this module's content.

## Section D — Trade-off reasoning

15. Argue for or against canary deployment for Project 2's payment API, using Lesson 3's specific criteria.
16. For a described workload (given in conversation), calculate its approximate duty cycle and recommend serverless, containers, or a hybrid, justified with this module's numbers.
17. Argue for or against adopting Kubernetes for a described small, 2-service system — using Lesson 5's complexity-cost content, not general enthusiasm for the technology.

## Section E — System design

18. Design Project 2's full infrastructure: compute model per component (Lesson 4), deployment strategy for the payment API specifically (Lesson 3), and whether Kubernetes orchestration is justified given the system's actual scale — justified against this module's content throughout.

---

**On passing:** update `PROGRESS.md` — Module 9 complete, log mastery levels. Module 10 (Reliability & Observability) unlocks next.
