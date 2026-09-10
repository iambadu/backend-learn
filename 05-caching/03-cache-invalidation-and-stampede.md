# Cache Invalidation & Stampede — "There Are Only Two Hard Things"

## 1. Why does this exist?

Phil Karlton's famous line — "there are only two hard things in Computer Science: cache invalidation and naming things" — exists because invalidation is genuinely, structurally hard, not because it's poorly documented. This lesson covers the two specific, well-understood hard problems inside "invalidation": knowing *when* a cached value is no longer valid, and surviving the moment when a popular cached value expires and every waiting request tries to regenerate it at once.

## 2. Mental model

Cache stampede (thundering herd) is what happens at a single door with a long line the instant it opens after being locked — everyone who was waiting rushes it simultaneously, when really only one person needed to walk through to unlock it for everyone else. The prevention techniques in this lesson are all, in one form or another, ways of making sure only one "person" actually does the expensive work while everyone else either waits briefly or is handed something good enough in the meantime.

## 3. Technical explanation

**The stampede mechanism, precisely:** a popular cache key expires (or is invalidated). In the brief window before it's repopulated, every concurrent request for that key sees a cache miss and independently goes to the expensive source (a database query, an external API call) to regenerate it — for a genuinely hot key, this can mean hundreds or thousands of simultaneous, redundant, expensive operations hitting your database at once, exactly when it's least prepared for a sudden spike, often creating the *very* database overload event that caching was supposed to prevent in the first place. This is a real, well-documented production incident pattern, not a theoretical edge case.

**Distributed locking / request coalescing — ensuring only one request does the expensive work:** the first request to observe a miss acquires a short-lived lock (commonly a Redis `SET key value NX EX ttl` — set only if not already present, with an expiry as a safety net against a crashed locker never releasing it) before going to the source; every other concurrent request either waits briefly for the lock-holder to finish and populate the cache, or — for latency-sensitive paths — falls back to serving stale data rather than waiting at all. This directly reduces N redundant expensive operations down to exactly 1, regardless of how many concurrent requests were waiting.

**Probabilistic early expiration — proactively refreshing before expiry, spread out so it doesn't itself synchronize into a stampede:** instead of waiting for a key to expire and then racing to regenerate it, each request checks — with a probability that increases the closer the key is to its actual expiry — whether it should proactively trigger a refresh right now, even though the cached value is technically still valid. Because this is probabilistic rather than a hard deadline, refreshes triggered by different concurrent requests naturally spread out across time rather than synchronizing into a single moment — on average, a refresh happens once, shortly before expiry, without every request needing to coordinate explicitly.

**Stale-while-revalidate — arguably the most broadly practical pattern, worth knowing by name since it shows up directly in HTTP caching semantics too (Module 2, Lesson 1's `Cache-Control` content), not just application-level caches:** when a cache entry expires, instead of blocking the requester on a fresh fetch, serve the (slightly) stale value immediately, while kicking off a background refresh that updates the cache for the *next* request. Users effectively never see a raw cache miss's full latency, and the backend only ever handles a single refresh operation per expiry, not a flood — the direct opposite of the stampede failure mode, achieved by deliberately tolerating a small amount of extra staleness in exchange for eliminating the redundant-work spike entirely.

**TTL jitter — a simple, low-effort mitigation worth applying by default, not just for acute stampede cases:** if many cache keys are all set with the identical TTL (a common, easy-to-fall-into pattern — e.g., a batch cache-warming job setting the same 300-second TTL on thousands of keys at once), they all expire simultaneously, creating a stampede across *many* keys at once rather than just one hot key. Adding a small amount of randomness to each key's TTL (e.g., `300 ± 30 seconds`) spreads expirations out over time, preventing synchronized mass-expiry regardless of whether any individual key is especially "hot."

**Invalidation strategies beyond plain TTL expiry — precisely because a fixed TTL is a blunt instrument that either under- or over-caches relative to when data actually changes:** **event-driven invalidation** actively evicts a cache entry the moment the underlying data changes (a write triggers a targeted delete or update, rather than waiting passively for a TTL to lapse) — this is exactly Lesson 2's cache-aside invalidation-on-write pattern, generalized. In a **distributed, multi-node cache deployment**, this requires a way for one node's invalidation to actually reach every other node holding a copy — commonly implemented via Redis Pub/Sub, where a node that modifies data publishes the affected key, and every subscribing node evicts its local copy in response — a real, necessary mechanism once you have more than one cache instance or a local, in-process cache layer in addition to a shared Redis layer (Lesson 5 covers multi-node caching's further complications directly).

## 4. How it works internally

A `SET key value NX EX 10` lock in Redis is atomic at the Redis level (Module 2, Lesson 6's atomicity-for-distributed-correctness content applies directly here) — this is precisely why it's the standard building block for stampede-prevention locking rather than a naive "check if a lock key exists, then set it" two-step application-level check, which would reintroduce exactly the race condition that lesson warned about for rate limiting.

## 5. Example

```
SET report:2026-09 "in-progress" NX EX 30
-- Returns OK if this request acquired the lock (first to arrive after
-- expiry); returns nil if another request already holds it — that
-- request should wait or serve stale data, not regenerate redundantly.
```

## 6. Code

```ts
async function getReportCached(key: string) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const gotLock = await redis.set(lockKey, '1', 'NX', 'EX', 30);
  if (!gotLock) {
    // another request is already regenerating — wait briefly, or serve
    // a stale fallback rather than piling onto the expensive source too.
    await sleep(100);
    return getReportCached(key); // retry, likely now cached
  }

  const fresh = await computeExpensiveReport();
  await redis.set(key, JSON.stringify(fresh), 'EX', 300);
  await redis.del(lockKey);
  return fresh;
}
```

## 7. Failure scenarios

- **A popular cache key expiring during a traffic spike with no stampede protection**, producing a sudden burst of redundant expensive database load precisely when the database is least able to absorb it — a real, well-documented incident shape.
- **A batch job setting identical TTLs on thousands of keys at once**, causing a synchronized mass-expiry stampede hours later, with no single "hot key" to blame and a root cause (identical TTLs, no jitter) that's easy to miss without knowing this lesson's content specifically.
- **A crashed lock-holder never releasing its lock**, permanently blocking every subsequent request from ever regenerating the cache — precisely why the lock must always carry its own short expiry (`EX 30` above) as a safety net, never relying solely on an explicit `DEL` that a crash could prevent from ever running.

## 8. Common misconceptions

- **"A cache stampede is a rare, unlikely edge case."** It's a predictable, common consequence of any sufficiently popular cached value having a fixed expiry — the question is when it happens under real traffic, not whether it can.
- **"Adding a lock around cache regeneration always adds unacceptable latency."** For most workloads, the lock-wait window is brief (one request's regeneration time, not N requests' full latency), and stale-while-revalidate avoids the wait entirely for latency-sensitive paths — the mitigation cost is usually far smaller than the stampede cost it prevents.
- **"TTL jitter is a minor, optional tweak."** It's a near-zero-cost, broadly applicable default that prevents an entire class of self-inflicted, synchronized-expiry incidents — there's little reason not to apply it by default on any batch-set caching pattern.

## 9. Trade-offs

Locking: eliminates redundant work, adds a brief wait for non-lock-holders. Stale-while-revalidate: eliminates both redundant work and wait time, at the cost of deliberately serving slightly stale data. Probabilistic early expiration: spreads refresh load naturally, at the cost of slightly more frequent (though individually cheap) proactive-refresh checks. TTL jitter: near-free, addresses synchronized multi-key stampedes specifically, doesn't help a single very-hot key's stampede on its own.

## 10. Real-world applications

- Any high-traffic public API or content platform with a "trending" or popular-item cache key is a textbook stampede risk — this is a standard, named production concern at any real scale, covered explicitly in caching-layer documentation (Redis's own included) for exactly this reason.
- Project 3's notification-count badges (Lesson 2's challenge) and Project 4's usage/billing dashboards are realistic candidates for stale-while-revalidate specifically, given their tolerance for brief staleness and their potential for many concurrent reads.

## 11. Connections

Directly extends Lesson 2's invalidation-on-write pattern (event-driven invalidation is that pattern generalized to distributed, multi-node caches) and Module 2, Lesson 6's atomic-operation content (the locking mechanism here is structurally identical to that lesson's distributed rate-limiting correctness requirement). Sets up Lesson 5 (multi-node cache consistency, where invalidation must propagate across nodes, not just within one).

## 12. Practical exercise

Implement the locking pattern from this lesson's code example, then write a test that fires 50 concurrent requests against a cold cache key and confirms the expensive "source" function is called exactly once, not 50 times.

## 13. Challenge

Design the caching and stampede-prevention strategy for a Project 3 notification-count endpoint that's read on every page load across a large user base, where the underlying count changes frequently. Choose between locking, stale-while-revalidate, and probabilistic early expiration, and justify your choice against this lesson's specific trade-offs for this specific access pattern.

## 14. Mastery test

- Explain the stampede mechanism precisely enough to state, given a described traffic pattern, whether a specific cache key is at real risk.
- Explain why a Redis `SET NX EX` lock is safe for stampede prevention in a way a naive "check then set" pattern isn't, connecting to Module 2, Lesson 6's atomicity content.
- Distinguish stale-while-revalidate from a locking-based approach by what each does to request-facing latency during regeneration.
- Explain why TTL jitter addresses a different failure shape than probabilistic early expiration, even though both involve randomness.
