# Choosing a Data-Access Strategy

## 1. Why does this exist?

Lessons 1–4 covered four points on one spectrum (raw JDBC, JPA/Hibernate, jOOQ/Spring Data JDBC, Drizzle) largely in isolation. This lesson is deliberately the synthesis — not a ranking, but a framework for making the actual decision, because "which data-access tool is best" is a wrong question in the same way "is REST better than gRPC" was a wrong question in Module 2 — the right question is always "best for which specific access pattern, in which specific part of this specific system."

## 2. Mental model

Think of the abstraction spectrum from this module as a dial between two costs that trade against each other in a fixed sum: **automation** (how much SQL-generation and object-mapping work the tool does for you) and **predictability** (how confidently you know exactly what SQL will execute, and when). Turning the dial toward more automation always costs some predictability; there is no point on this spectrum that gets you both for free, and pretending otherwise is how N+1-shaped surprises happen.

## 3. Technical explanation

**The decision axes, stated precisely, the way the roadmap originally framed this module:**
- **Abstraction level**: how much of the relational model is hidden behind objects (JPA/Hibernate: high) vs. exposed directly (jOOQ/Drizzle: low, by design).
- **Performance predictability**: how confidently you can predict the SQL a given piece of code will generate, and therefore its cost (jOOQ/Drizzle: high, close to 1:1; JPA/Hibernate: low, without active discipline).
- **Developer productivity for common cases**: how fast you can build straightforward CRUD (JPA/Hibernate and Prisma-style tools: high, out of the box; jOOQ/Drizzle: requires writing more explicit code per operation).
- **SQL control**: how much you can lean on database-specific features, hand-tune query shape, and use advanced SQL (window functions, Module 3 Lesson 2's content) without fighting the tool (jOOQ/Drizzle: high, direct; JPA/Hibernate: often requires dropping to native queries anyway for anything beyond straightforward CRUD).
- **Debuggability**: how easy it is, when something's slow or wrong, to find out exactly what SQL ran and why (jOOQ/Drizzle: usually trivial, since the code *is* close to the SQL; JPA/Hibernate: requires enabling SQL logging and actively watching for exactly Lesson 2's hidden-query patterns).
- **Maintainability under schema change**: how loudly and early a schema change (Module 3, Lesson 8) surfaces as a compile-time or migration-time signal versus a silent runtime surprise (jOOQ: compile-time, via schema-introspecting code generation; Drizzle: compile-time, via TypeScript types derived from the schema; JPA/Hibernate: runtime, typically, unless you've built additional tooling).

**A concrete, decision-relevant synthesis, not a hedge — because the curriculum's own stated default stack (TypeScript + NestJS + PostgreSQL + Drizzle) is itself an answer to this question, worth stating explicitly rather than leaving implicit:** for a team that already knows SQL reasonably well (your stated background) and is building a system where correctness and predictable query cost genuinely matter (Project 2's financial ledger being the clearest case in this curriculum), the automation-heavy end of the spectrum (JPA/Hibernate, Prisma-style abstraction) buys comparatively little — you already pay the cost of knowing SQL, so a tool that hides it from you is trading away visibility you'd actually use, for convenience you don't especially need. A team without that SQL background, or building a large volume of straightforward, low-stakes CRUD where iteration speed dominates over query-level precision, gets genuinely more value from the automation end.

**A single codebase using more than one tool is a legitimate, common, non-contradictory choice — worth naming explicitly, because Lessons 1–4 might otherwise read as "pick exactly one":** it's entirely reasonable to use an ORM-adjacent tool for a system's high-volume, straightforward CRUD paths, and drop to raw SQL, jOOQ, or Drizzle's base query builder specifically for the handful of genuinely complex, performance-critical, or correctness-critical queries (a financial reconciliation report, Module 3 Lesson 2's window-function-driven ledger balance) where predictability matters more than convenience. This isn't inconsistency — it's applying this lesson's dial deliberately, per access pattern, rather than dogmatically, system-wide.

## 4. How it works internally

The actual, practical signal for "this specific query path needs to move toward the low-automation end of the spectrum" is almost always discovered the same way Module 3, Lesson 4 taught: `EXPLAIN ANALYZE` reveals a query shape you didn't expect or can't control through your current tool's abstraction — at that point, the right response isn't abandoning your data-access tool entirely, it's dropping to a more explicit mode (a native query, a raw SQL escape hatch, jOOQ/Drizzle's base builder) for that specific path, while keeping the higher-level tool for everything else that doesn't need it.

## 5. Example

A single NestJS service using Drizzle's base query builder for typical CRUD, and a raw, hand-tuned SQL query (still executed via Drizzle's `sql` tagged-template escape hatch, keeping parameterization safety from Lesson 1) for one specific, performance-critical reporting endpoint — a real, common, entirely legitimate pattern, not a compromise to be embarrassed about.

## 6. Code

```ts
// Drizzle's raw-SQL escape hatch — full control when the base query
// builder's abstraction genuinely gets in the way, WITHOUT losing
// PreparedStatement-equivalent parameterization safety from Lesson 1:
import { sql } from 'drizzle-orm';

const report = await db.execute(sql`
  SELECT account_id, SUM(amount) OVER (PARTITION BY account_id ORDER BY created_at) AS balance
  FROM ledger_entries WHERE created_at > ${startDate}
`);
```

## 7. Failure scenarios

- **Dogmatically committing to one tool for every access pattern in a system**, forcing a genuinely complex reporting query through an ORM's object-graph abstraction (fighting it, producing worse SQL than hand-written) rather than dropping to a lower-automation escape hatch for that one path.
- **Choosing a tool based on team familiarity or trend alone**, without weighing this lesson's actual axes against the specific system's actual requirements (Project 2's correctness needs are a genuinely different weighting than a low-stakes internal admin tool's).

## 8. Common misconceptions

- **"A mature system should use exactly one data-access approach everywhere, for consistency."** Consistency is valuable for *predictability within a given kind of access pattern*, not as an end in itself — using the right tool per access pattern, deliberately and documented, is more consistent with this module's actual reasoning than uniformity for its own sake.
- **"The 'modern' choice (whatever's currently trending) is automatically the right one."** Every tool in this module remains a legitimate, actively-used production choice — the decision is about fit to your team and system's actual requirements, not about recency.

## 9. Trade-offs

This lesson's entire content is a trade-off framework, not a single trade-off — the meta-point is that the "right" position on the automation/predictability spectrum is a function of your team's SQL fluency, your system's correctness stakes, and the specific access pattern in question, re-evaluated per case rather than decided once, globally, forever.

## 10. Real-world applications

- Directly, immediately applicable to every project in this curriculum from here forward — Projects 1–5 will each require you to make and defend this exact choice, per major access pattern, not just once at project kickoff.

## 11. Connections

Synthesizes Lessons 1–4 directly. Sets up every subsequent Level 3-adjacent decision in Projects 1–5, and previews Level 12 (Performance) — this lesson's "drop to a lower-automation mode when EXPLAIN ANALYZE reveals a problem" pattern is exactly that module's measurement-first discipline applied here.

## 12. Practical exercise

For a system you've built (or are building), audit every major query path and classify each on this lesson's axes — which ones genuinely benefit from high automation, and which ones (if any) are quietly paying an automation cost (an N+1-shaped pattern, an unpredictable query, a debugging difficulty) that a lower-automation tool would remove.

## 13. Challenge

For Project 4 (Multi-Tenant SaaS), design the data-access strategy across its distinct access patterns (routine CRUD for org/user management, complex permission-check queries — Module 2 Lesson 3's ReBAC content, usage/billing aggregation reporting) and justify a specific tool choice per pattern, not one tool for the whole project.

## 14. Mastery test

- State the six decision axes from this lesson and, for any two tools from Lessons 1–4, contrast them precisely on each axis.
- Explain why using more than one data-access tool within a single codebase is a legitimate, deliberate choice rather than inconsistency, with a concrete example of when it's justified.
- Given a described system's requirements (in conversation), recommend a data-access strategy and defend it against this lesson's axes, not against general reputation or popularity.
