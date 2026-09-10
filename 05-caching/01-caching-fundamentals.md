# Caching Fundamentals — Why It Works, and What It Actually Costs

## 1. Why does this exist?

Module 3 gave you the tools to make a database genuinely fast — indexes, query planning, connection pooling. Caching is a different, complementary lever: instead of making the expensive operation faster, you avoid doing it again at all. But a cache is not a free performance switch, any more than an index was (Module 3, Lesson 3) — it's a second, separate copy of data that can now disagree with the source of truth, and every caching decision is really a decision about how much staleness you're willing to tolerate in exchange for speed.

## 2. Mental model

Caching works because most real-world data access follows **locality** — you're far more likely to need the same or nearby data again soon than to need something you've never touched. A cache is a smaller, faster store sitting between your application and a slower source of truth, betting that this locality pattern holds often enough that "check the fast store first" pays for itself.

## 3. Technical explanation

**Why caching works, precisely — not just "memory is faster than disk," but the actual economics:** every cache decision is a bet, informed by two numbers: the **hit rate** (what fraction of lookups the cache actually satisfies) and the **cost ratio** between a cache hit and a cache miss (how much more expensive it is to fall through to the real source). A cache with a 90% hit rate and a miss that costs 100x a hit reduces average lookup cost by roughly 10x compared to no caching at all — but a cache with a 20% hit rate on the same cost ratio barely helps, and might not be worth its own operational complexity. This is why "should we cache this" is a quantitative question, not a reflexive one — Level 12's measurement-first discipline applies here just as directly as it applied to Module 3's indexing decisions.

**TTL (time-to-live) design — the single lever controlling the core trade-off of every cache:** a shorter TTL means fresher data and a lower risk of serving something stale, at the cost of a lower hit rate (more frequent recomputation/misses). A longer TTL means a higher hit rate and better performance, at the cost of potentially serving stale data for longer. This is the exact same trade-off Module 1, Lesson 4 introduced for DNS TTLs — the same underlying tension (how long do you trust a cached value) recurring at a different layer, which is precisely why that lesson flagged it as a preview of this one.

**Why caching is a source of *correctness* risk, not just a performance lever — the part that's easy to underweight:** the moment you cache something, you've created a second copy of a fact that can now diverge from the source of truth (Module 3, Lesson 1's normalization content is directly relevant — a cache is, in effect, a deliberately accepted, time-bounded denormalization). Every caching decision needs an explicit answer to "what happens when this cache is wrong, briefly" — for a product listing's view count, briefly stale is harmless; for Project 2's account balance, briefly stale could mean a double-spend, and caching that value at all needs far more care than caching a view count does.

**What's actually worth caching — a real, non-obvious selection criterion beyond "things that are read often":** the best caching candidates combine **high read frequency**, **expensive-to-compute-or-fetch source data**, and **tolerance for some staleness** — data that's cheap to compute in the first place gains little from caching (the cache-management overhead can exceed the savings), and data with zero staleness tolerance (Project 2's real-time balance, mid-transaction) is dangerous to cache regardless of how often it's read, unless the caching strategy is specifically designed around that constraint (Lesson 2's write-through pattern, for instance).

## 4. How it works internally

A typical NestJS service checking a cache before a database query is inserting an explicit, application-level decision point — the cache doesn't know anything about your data's meaning or staleness tolerance; it only knows keys, values, and TTLs. All of the correctness reasoning about what's safe to cache and for how long lives entirely in your application design, not in the cache technology itself — Redis is equally happy holding a stale, wrong balance as a correctly-fresh one; it enforces nothing about your data's actual semantics.

## 5. Example

```
redis-cli SET user:42:profile '{"name":"..."}' EX 300   # 5-minute TTL
redis-cli TTL user:42:profile                             # watch it count down
```

## 6. Code

```ts
async function getUserProfile(userId: string) {
  const cached = await redis.get(`user:${userId}:profile`);
  if (cached) return JSON.parse(cached); // hit — the fast path

  const profile = await db.query('SELECT ... WHERE id = $1', [userId]); // miss
  await redis.set(`user:${userId}:profile`, JSON.stringify(profile), 'EX', 300);
  return profile;
}
```

## 7. Failure scenarios

- **Caching account-balance-shaped data with a plain TTL** and no consideration for what a stale read means for a concurrent write (previewed here, addressed properly in Lesson 2's write-through strategy) — a real, direct risk for exactly Project 2's core data.
- **Caching cheap-to-compute data reflexively** ("we cache everything by default") — adds real operational complexity (cache invalidation logic, memory cost, a whole new failure mode) for negligible actual performance benefit.
- **No monitoring of actual hit rate**, meaning a cache that's quietly providing little value (or has silently degraded, e.g. due to a key-naming bug fragmenting what should be shared cache entries) goes unnoticed indefinitely.

## 8. Common misconceptions

- **"Redis is fast because it's in-memory."** True but incomplete — Lesson 4 gives this the full, precise mechanical answer (single-threaded event loop avoiding lock contention, optimized data structures), not just "memory beats disk."
- **"Caching is purely a performance optimization with no correctness implications."** Every cache is a deliberately accepted, time-bounded staleness trade — treating it as risk-free is exactly how stale-data bugs happen.
- **"More caching is always better."** Diminishing and sometimes negative returns past the point where hit rate and cost-ratio economics actually justify it — Module 3, Lesson 3's "more indexes isn't free" reasoning applies here in direct parallel.

## 9. Trade-offs

Shorter TTL: fresher, lower hit rate. Longer TTL: higher hit rate, staler. Caching at all: real performance upside for the right access pattern, real correctness risk and operational complexity for the wrong one — the decision is never free in either direction.

## 10. Real-world applications

- Product catalog data (read far more often than written, tolerant of brief staleness) is a textbook good caching candidate; real-time inventory counts during a flash sale are a textbook risky one, requiring the more careful strategies Lesson 2 covers.

## 11. Connections

Directly extends Module 1, Lesson 4's DNS-TTL preview of this exact trade-off, and Module 3, Lesson 1's denormalization framing (a cache is a deliberate, time-bounded denormalization). Sets up Lesson 2 (specific strategies for keeping a cache and its source of truth coherent) and Lesson 3 (what happens when many requests hit a cold or expired cache simultaneously).

## 12. Practical exercise

For an app you've built, list every piece of data currently fetched from a database on every request. For each, estimate its read frequency, compute cost, and staleness tolerance, and decide which are genuinely good caching candidates by this lesson's criteria — not by instinct.

## 13. Challenge

Project 2's account balance is read very frequently (every transfer needs to check it) and has essentially zero staleness tolerance. Using only this lesson's content (not yet Lesson 2's write-through pattern), explain precisely why a naive TTL-based cache-aside approach is dangerous here, and what property a safe caching approach for this specific data would need.

## 14. Mastery test

- Explain the hit-rate/cost-ratio math well enough to state, given specific numbers, whether caching a given access pattern is worthwhile.
- Explain why a cache is a form of denormalization, connecting directly to Module 3, Lesson 1's vocabulary.
- Given a described piece of data, evaluate it against this lesson's three-part caching-candidate criterion and justify a decision.
