# Module Exam — 04: Data Access

Cumulative test across Lessons 1–5. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. Explain the object-relational impedance mismatch and state, in one sentence, what every tool in this module is trying to solve about it.
2. Define N+1 precisely, and explain why `FetchType.LAZY` alone doesn't prevent it.
3. Explain jOOQ's core design commitment and why it structurally prevents accidental N+1.
4. Explain what Spring Data JDBC removes from JPA's automation model.
5. Explain why "Drizzle is TypeScript's jOOQ" is an accurate structural claim, not a loose comparison.

## Section B — Explain in your own words

6. Explain both reasons `PreparedStatement`/parameterized queries matter — not just the security one.
7. Explain Open Session In View and why disabling it makes N+1 easier to catch, not harder.
8. Explain the identity map pattern and what it guarantees within a session.

## Section C — Scenario diagnosis

9. An endpoint serializing a list of 200 orders with their line items takes 4 seconds in production but was fast in local testing with 5 orders. Diagnose using this module's content.
10. A jOOQ-based codebase starts throwing compile errors across a dozen files after a routine schema migration. Explain why this is a feature, not friction, using Lesson 3's content.
11. A Drizzle-based endpoint is slower than expected on a complex reporting query. Using this module's synthesis lesson, describe your diagnostic and remediation process.

## Section D — Trade-off reasoning

12. Argue for or against JPA/Hibernate for a described greenfield project (given in conversation) with a team new to SQL.
13. Defend using more than one data-access tool within Project 4, citing specific access patterns.
14. Argue for Drizzle over Prisma for Project 2's ledger specifically, using this module's transparency/predictability content — not general preference.

## Section E — System design

15. Design the data-access strategy for Project 1 (Production REST API): which tool, and specifically how you'd structure the two or three most complex query paths to avoid this module's named failure modes.

---

**On passing:** update `PROGRESS.md` — Module 4 complete, log mastery levels. Module 5 (Caching) unlocks next.
