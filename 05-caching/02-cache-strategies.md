# Cache Strategies — Aside, Through, and Behind

## 1. Why does this exist?

Lesson 1 established that every cache is a deliberate staleness trade — this lesson is about the specific, named patterns for *how* the cache and the source of truth actually stay related to each other, each making that trade differently. "We use a cache" is incomplete until you specify which of these strategies, because they have genuinely different failure modes, not just different performance profiles.

## 2. Mental model

**Cache-aside**: the application is in charge, checking the cache first and falling back to the source, updating the cache itself on a miss — the cache is a passive, dumb store that only knows what the application chose to tell it. **Write-through**: every write goes to the cache and the source of truth together, synchronously, so the cache is never stale on the next read — safety bought with slower writes. **Write-back (write-behind)**: writes go to the cache immediately and are flushed to the source of truth later, asynchronously — fast writes, with a real window where a crash loses data that was acknowledged but never persisted.

## 3. Technical explanation

**Cache-aside (lazy loading) — the pattern from Lesson 1's code example, and the most common because it's the easiest to add to an existing system without redesigning your write path:** on a read, check the cache; on a miss, read from the source and populate the cache; on a write, update the source and either update or (more commonly, and more simply) **invalidate** the corresponding cache entry, letting the next read repopulate it fresh. Its defining weakness: because the cache is populated lazily and passively, there's a real window right after a write where the cache holds the old value until invalidation completes — and if invalidation is missed or delayed (a bug, a network partition to the cache), the cache can silently drift stale indefinitely, since nothing is actively re-checking it.

**Read-through — a close cousin of cache-aside, differing in *where* the miss-handling logic lives:** in cache-aside, your application code explicitly handles the miss (query the database, populate the cache); in read-through, the caching layer itself is configured to know how to fetch from the source on a miss, so your application only ever talks to the cache, never directly to the database for that data. This is more a matter of *where the responsibility for miss-handling lives* than a fundamentally different consistency model — the staleness/invalidation trade-offs are essentially the same as cache-aside.

**Write-through — trading write latency for read-side guaranteed freshness:** every write synchronously updates both the cache and the backing store before being considered complete — meaning the *very next* read is guaranteed to see the fresh value, with no invalidation-timing gap at all. This directly closes cache-aside's stale-window weakness, at a real, unavoidable cost: every write now waits on two operations instead of one, and — a genuinely underappreciated cost — write-through can **pollute the cache with data that's never actually read again** (every write populates the cache regardless of whether that specific data is ever subsequently requested), wasting cache memory on cold data that a lazy cache-aside approach would never have cached in the first place.

**Write-back (write-behind) — trading durability for write speed:** a write is acknowledged as soon as it hits the cache, and the actual persistence to the backing store happens **asynchronously**, batched or delayed. This is genuinely fast for the write path, but opens a real, specific danger: if the cache crashes (or the process holding the pending writes dies) before the async flush completes, those writes are **lost entirely** — acknowledged to the caller, never actually durable. This is precisely the kind of trade-off that should immediately disqualify write-back for anything resembling Project 2's financial writes, and precisely the kind of trade-off that's genuinely fine for, say, a view-counter increment or an analytics event where losing a handful of writes during a rare crash is a real but acceptable cost.

**The realistic, production-grade answer to "which one should we use" — the same lesson Level 4's synthesis lesson taught, applied here:** different strategies for different keys within the same system is entirely legitimate and common — cache-aside for a rarely-changing, read-heavy user profile; write-through for an inventory count that must never show stale availability to a concurrent buyer; write-back never for Project 2's core ledger, but plausibly fine for a non-critical, high-volume metrics counter feeding a dashboard. The choice is a per-data-type decision grounded in Lesson 1's staleness-tolerance criterion, not a single, system-wide default.

## 4. How it works internally

A write-through implementation in a NestJS service wraps the database write and the cache write in a sequence where the operation isn't considered complete until both succeed — this is conceptually similar to, though mechanically distinct from, Module 3, Lesson 5's transactional atomicity (a cache write and a database write are not part of one ACID transaction across two different systems — Level 7's distributed-transaction content addresses that harder problem; write-through here typically just means "do both, in order, and handle the case where the second fails" as application logic, not database-guaranteed atomicity).

## 5. Example

```ts
// Cache-aside (Lesson 1's pattern) vs. write-through, side by side:

// Cache-aside write path: update source, then invalidate (not update) cache
async function updateProfile(userId: string, data: ProfileData) {
  await db.query('UPDATE users SET ... WHERE id = $1', [userId]);
  await redis.del(`user:${userId}:profile`); // next read repopulates fresh
}

// Write-through: update BOTH synchronously, cache is never stale after this call
async function updateInventoryCount(sku: string, count: number) {
  await db.query('UPDATE inventory SET count = $1 WHERE sku = $2', [count, sku]);
  await redis.set(`inventory:${sku}`, count); // no invalidation gap
}
```

## 6. Failure scenarios

- **A missed cache invalidation** under cache-aside (a bug, a crashed process between the database write and the cache invalidation call) leaving stale data served indefinitely, with no mechanism to self-correct until the TTL (if any) eventually expires.
- **Write-back data loss on a crash** — acknowledged writes that never made it to durable storage, a genuinely unacceptable risk for anything resembling financial data, and a real, documented failure mode for this specific strategy, not a hypothetical edge case.
- **Write-through's cache pollution** silently consuming cache memory on data that's written often but read rarely, degrading effective hit rate for the data that actually benefits from caching, without any error or obvious symptom pointing at the cause.

## 7. Common misconceptions

- **"Cache-aside and read-through are fundamentally different consistency models."** They share essentially the same staleness/invalidation profile — the difference is architectural (where the miss-handling logic lives), not a different guarantee.
- **"Write-through guarantees the cache and database are always consistent."** It guarantees the *next read after a completed write* sees fresh data — it does not, by itself, provide atomicity between the two writes (a crash between them is possible unless additional handling is added) and says nothing about consistency during the brief window a write is in flight.
- **"Write-back is just a faster version of write-through, generally superior."** It trades away a genuine durability guarantee for that speed — not a strict improvement, a different risk profile entirely, correct only for data that can tolerate losing recent writes.

## 8. Trade-offs

Cache-aside: simple, flexible, real stale-window risk if invalidation is missed or delayed. Write-through: no stale-window risk, slower writes, real cache-pollution risk. Write-back: fastest writes, real data-loss risk on crash — appropriate only for genuinely loss-tolerant data.

## 9. Real-world applications

- Project 2's inventory-adjacent or rate-limit-adjacent counters (Module 2, Lesson 6's GCRA content is itself effectively a write-through-shaped pattern, where Redis *is* the source of truth for the counter, not a cache of something else) are natural write-through candidates; user-profile-shaped data across nearly every SaaS product is a natural cache-aside candidate.

## 10. Connections

Directly extends Lesson 1's staleness-tolerance framework with concrete implementation patterns. Sets up Lesson 3 (what happens when a cache-aside cache's TTL expires and many concurrent requests hit the resulting miss simultaneously) and connects back to Module 3, Lesson 5 (write-through's two-writes-in-sequence problem is a smaller-scale instance of the "can't span a transaction across two systems" issue that lesson's failure-scenario content named for external API calls).

## 11. Practical exercise

Implement both a cache-aside and a write-through version of a simple key-value read/update path, then deliberately simulate a crash between the two writes in the write-through version (e.g., throw an exception after the database write but before the cache write) and observe the resulting inconsistency — confirming write-through's "guarantee" has a real, specific gap unless explicitly handled.

## 12. Challenge

For Project 3 (Notification Platform), design which caching strategy fits each of: a user's notification preferences (read often, changed rarely), an unread-notification count badge (read very often, written on every new notification, must feel real-time to the user), and a rendered notification's content (immutable once created). Justify each choice against this lesson's specific trade-offs.

## 13. Mastery test

- Explain precisely why cache-aside has a stale-data window that write-through closes, and what write-through gives up to close it.
- Explain write-back's specific, real risk precisely enough to state exactly what data it's genuinely appropriate for and what it's never appropriate for.
- Given a described data type and its read/write pattern (in conversation), select and justify a caching strategy using this lesson's trade-offs, not general preference.
