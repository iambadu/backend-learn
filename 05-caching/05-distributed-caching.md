# Distributed Caching — When One Redis Instance Isn't Enough

## 1. Why does this exist?

Lesson 4 covered a single Redis instance's internals; this lesson covers what changes once you have more than one — whether because your dataset outgrows a single node's memory, your traffic outgrows a single node's throughput, or you need redundancy against a single node's failure. This is where caching stops being purely an application-design decision and starts being a genuine distributed-systems problem — a direct, hands-on preview of Level 7's content, encountered here first through the concrete lens of caching.

## 2. Mental model

A single Redis instance is one filing cabinet; a Redis Cluster is many filing cabinets in different rooms, with a system for deciding which cabinet holds which file, so that no client needs to check every cabinet to find one thing.

## 3. Technical explanation

**Redis Cluster's sharding mechanism — a direct, concrete application of Module 1, Lesson 8's hashing content, now applied to cache placement instead of load-balancer backend selection:** Redis Cluster maps every key to one of **16,384 hash slots** via `CRC16(key) mod 16384`, and each primary node in the cluster owns a subset of those slots — a client (or the cluster itself, via redirection) determines which node holds a given key by computing its slot and looking up which node currently owns it. This is conceptually a hash-based sharding scheme (Module 3, Lesson 10's sharding content, applied here) with a fixed, large number of slots specifically chosen to make **rebalancing** (moving slot ownership between nodes when the cluster grows or shrinks) a matter of reassigning whole slots between nodes, rather than needing to rehash every individual key — directly analogous to why Module 1, Lesson 8's consistent hashing minimized reshuffling on backend-pool changes.

**Hash tags — a specific, necessary escape hatch, worth knowing because multi-key operations (transactions, certain Lua scripts) require all involved keys to live on the same node:** Redis Cluster doesn't support atomic multi-key operations across keys that land on different nodes (there's no cluster-wide transaction mechanism spanning nodes) — so for cases where you genuinely need several related keys colocated (e.g., a user's profile and their session, if both need to be updated together), Redis supports **hash tags**: wrapping a portion of the key in braces (`user:{42}:profile` and `user:{42}:session`) makes only that bracketed substring count toward the hash-slot computation, guaranteeing both keys land on the same node regardless of their full key names otherwise differing.

**CAP-theorem trade-offs, made concrete for the first time in this curriculum through Redis Cluster specifically (Level 7 formalizes CAP generally; this is where you first feel its consequences directly, hands-on):** Redis Cluster does **not** guarantee strong consistency during partitions or failover — under a network partition, or during the brief window of a primary failing over to a replica, a client can, in specific documented scenarios, have a write acknowledged by a primary that hasn't yet replicated to its replica before that primary becomes unreachable, and a subsequent failover promotes a replica that never received that write — the write is silently lost, from the cluster's perspective. This is a genuine, deliberate design trade-off (favoring availability and partition tolerance over the strongest possible consistency, precisely the CAP dynamic Level 7 will name explicitly) — and it's a real, concrete reason a distributed cache should very rarely be treated as an unconditional source of truth for anything with strict consistency requirements (Project 2's ledger again being the clearest example of data that should live in Postgres, with its full ACID guarantees from Module 3, not primarily in a Redis Cluster).

**Multi-node cache invalidation — the concrete problem Lesson 3's event-driven invalidation content was building toward, now genuinely distributed:** if you're running local, in-process caches on each of several application server instances *in addition to* a shared Redis layer (a common pattern for the hottest, most latency-sensitive data — even a Redis round trip has some cost, Module 1's latency content applies directly), invalidating a value means ensuring every application instance's local cache, not just the shared Redis layer, learns about the change. **Redis Pub/Sub** is the standard mechanism: the instance that performs a write publishes an invalidation message on a channel; every other instance subscribes and evicts its own local copy on receipt — this is the same event-driven-invalidation idea from Lesson 3, now spanning multiple, independent application processes rather than a single shared cache.

**Cache coherence's actual, honest limit — worth stating plainly rather than implying multi-node invalidation is a solved problem:** Pub/Sub-based invalidation is **best-effort**, not guaranteed — a message published while a subscriber is briefly disconnected is simply missed (Redis Pub/Sub doesn't persist or redeliver messages the way a proper message queue, Level 6, does), meaning a local cache can, in a real, non-hypothetical scenario, miss an invalidation and serve stale data until its own TTL eventually expires. This is precisely why a short, sane TTL as a *backstop* remains valuable even when event-driven invalidation is also in place — the two aren't redundant, they're complementary, with the TTL bounding the worst case when the event-driven path fails.

## 4. How it works internally

A Redis Cluster client library maintains a local map of which hash slots belong to which node (refreshed periodically and on redirection responses), computing `CRC16(key) mod 16384` client-side to route each command directly to the correct node when possible, and following a `MOVED` redirection response from a node that no longer owns a requested slot (during rebalancing) when its local map is briefly out of date.

## 5. Example

```
redis-cli -c CLUSTER KEYSLOT "user:42:profile"   # shows which of the 16384 slots this key maps to
redis-cli -c CLUSTER NODES                        # shows which node owns which slot ranges
```

## 6. Code

```ts
// Hash tags forcing colocation for a multi-key operation Redis Cluster
// couldn't otherwise guarantee atomicity across:
await redis.multi()
  .set('user:{42}:profile', profileData)
  .set('user:{42}:session', sessionData)
  .exec(); // both keys share the {42} hash tag — guaranteed same node
```

## 7. Failure scenarios

- **A multi-key Lua script or transaction failing at runtime** because its keys weren't hash-tagged and landed on different nodes — a real, specific Redis Cluster error (`CROSSSLOT`), directly explained by this lesson's slot-mapping content.
- **A write silently lost during a primary failover**, exactly as described above — a real, documented Redis Cluster consistency gap, not a bug, but a deliberate availability-favoring design choice that must be accounted for by never treating Redis Cluster as a strongly-consistent source of truth for critical data.
- **A local, in-process cache serving stale data indefinitely** because a Pub/Sub invalidation message was missed during a brief disconnection, with no TTL backstop in place to eventually self-correct.

## 8. Common misconceptions

- **"Redis Cluster is just Redis, but bigger — same consistency guarantees."** It has genuinely different, weaker consistency guarantees during partitions/failover than a single instance's straightforward, unpartitioned behavior — a real, important distinction, not a scaling detail you can ignore.
- **"Pub/Sub-based cache invalidation is a reliable, guaranteed-delivery mechanism."** It's best-effort — messages to disconnected subscribers are simply lost, which is precisely why a TTL backstop remains necessary even with event-driven invalidation in place.
- **"More Redis nodes automatically means better performance for everything."** Cross-slot operations (unless hash-tagged) and rebalancing overhead are real costs sharding introduces — it solves capacity/throughput ceilings, not every performance problem, and a poorly-designed key scheme can make a cluster genuinely harder to use correctly than a single instance.

## 9. Trade-offs

Redis Cluster: real horizontal scaling of both capacity and throughput beyond a single node's limits, at the cost of losing single-instance's simpler consistency guarantees and native cross-key atomicity (without hash-tag discipline). Pub/Sub invalidation: low-latency, low-overhead multi-node cache coherence, with a real, honest best-effort delivery limitation that a TTL backstop must cover.

## 10. Real-world applications

- Any system operating at a scale where a single Redis instance's memory or throughput ceiling is a genuine constraint (large SaaS platforms, high-traffic consumer products) runs Redis Cluster or an equivalent sharded caching layer — a real, common production architecture, not an exotic edge case.
- This lesson's CAP-adjacent content is directly, concretely relevant to Project 2's design: knowing precisely which data must never live only in a distributed cache (or must be treated with explicit awareness of its weaker guarantees if it does) is a real design decision this lesson equips you to make correctly.

## 11. Connections

Directly extends Module 1, Lesson 8 (consistent hashing, now applied to cache-node placement) and Module 3, Lesson 10 (sharding, the same core idea applied to a cache instead of a primary datastore). Directly previews Level 7's CAP theorem content — this lesson is where you first encounter its practical consequences, before that module names and formalizes the theory.

## 12. Practical exercise

Set up a local Redis Cluster (even a small, 3-6 node local cluster is sufficient), attempt a multi-key operation on two un-hash-tagged keys and observe the `CROSSSLOT` error, then fix it with hash tags and confirm it succeeds.

## 13. Challenge

For Project 4 (Multi-Tenant SaaS), design the caching architecture across a horizontally-scaled application fleet: what's cached where (shared Redis Cluster vs. local per-instance caches), how invalidation propagates, and explicitly which pieces of tenant data should never be treated as strongly consistent purely because they're read from cache, using this lesson's CAP-adjacent content to justify the boundary.

## 14. Mastery test

- Explain Redis Cluster's hash-slot mechanism precisely enough to state why it makes rebalancing cheaper than a naive `hash(key) mod N` scheme would.
- Explain what hash tags do and why they're necessary for certain multi-key operations, connecting to the `CROSSSLOT` failure mode.
- Explain the specific, concrete scenario in which Redis Cluster can lose a write during failover, and why this makes it unsuitable as a sole source of truth for strictly consistent data.
- Explain why Pub/Sub-based invalidation needs a TTL backstop even though it's the "correct," event-driven approach.
