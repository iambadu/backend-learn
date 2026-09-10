# Distributed Locks — Why "It's Just a Mutex Over the Network" Is Wrong

## 1. Why does this exist?

Module 3, Lesson 6 introduced row-level locks within a single database — a well-understood, single-system problem. A distributed lock tries to provide the same "only one holder at a time" guarantee, but across independent processes, potentially on independent machines, communicating over the same unreliable network every other lesson in this module has been contending with. The roadmap's flagged misconception — "a distributed lock is just a mutex over the network" — undersells the problem badly, and this lesson exists to give you Martin Kleppmann's well-known, technically precise critique of Redis's Redlock algorithm as the concrete case study for exactly why.

## 2. Mental model

A single-process mutex works because the operating system can *guarantee* that only one thread physically executes the protected code at a time — there's no ambiguity about who holds it. A distributed lock has no such guarantee available: the "holder" is a separate process that could pause for an unpredictable, unbounded amount of time (a garbage-collection pause, a page fault, a slow disk write) without the lock service knowing anything is wrong — and when it resumes, it might still believe it holds a lock that has, in the meantime, actually expired and been granted to someone else.

## 3. Technical explanation

**The specific failure Kleppmann's critique centers on — the "process pause" problem, worth tracing through precisely because it's the crux of the entire issue:** Client A acquires a Redis-based lock (commonly implemented as `SET lock_key unique_value NX EX ttl`) intending to safely perform some operation on a shared resource. Before it finishes, Client A's process **pauses** for longer than the lock's TTL — a garbage-collection pause is the canonical, entirely realistic example, but a virtual-machine live-migration stall, a slow disk write blocking the process, or even an extended OS scheduling delay all produce the identical effect. While A is paused, its lock **expires** (Redis has no way to know A is merely paused rather than genuinely finished or crashed), and Client B legitimately acquires the same lock and begins its own work on the shared resource. Client A then **resumes**, still believing — correctly, from its own local perspective — that it holds the lock, and continues its operation, now genuinely concurrent with Client B's, on the same resource — the exact violation ("only one holder at a time") the lock existed to prevent, occurring despite both clients following the locking protocol correctly.

**Why Redlock specifically doesn't fix this — Kleppmann's precise critique, not a general dismissal of Redis-based locking entirely:** Redlock (acquiring the lock across a majority of independent Redis instances, intended to add fault tolerance) makes the algorithm more resilient to a single Redis instance failing, but does **nothing** to address the process-pause problem above, because that problem has nothing to do with how many Redis instances are involved — it's about the *lock holder's own process* losing track of time relative to the lock's TTL, a failure mode entirely orthogonal to Redis's own availability. Kleppmann's stated conclusion is precise and worth quoting directly in substance: Redlock is "neither fish nor fowl" — genuinely too heavyweight and complex for locks that are merely an efficiency optimization (where an occasional double-execution is a tolerable, low-cost bug, not a correctness catastrophe), while simultaneously not actually safe enough for cases where correctness genuinely depends on the lock never being violated.

**Fencing tokens — the actual, correct fix, and precisely why it works where Redlock's TTL-based approach alone doesn't:** when a lock service grants a lock, it also returns a **monotonically increasing fencing token** (a simple, ever-incrementing integer works). The lock holder includes this token in every subsequent request to the actual protected resource — and critically, **the resource itself** (not the lock service) is responsible for rejecting any request whose token is lower than the highest token it has already seen. In the process-pause scenario above: Client A acquired the lock with token 33; while paused, its lock expired and Client B acquired it with token 34, performing its own writes (each tagged with token 34) to the resource; Client A resumes and attempts its own write, still tagged with the now-stale token 33 — the resource, having already seen token 34, correctly **rejects** Client A's stale request outright, closing the exact gap Redlock's TTL-based approach left open. This is a genuinely important architectural shift: the fix doesn't live in making the *lock* more reliable — it lives in making the *protected resource itself* fencing-token-aware, which requires the resource to cooperate with the locking scheme, not something a lock service alone can retrofit onto an unaware resource.

**Kleppmann's actual, stated recommendation, worth taking at face value rather than softening:** if correctness genuinely depends on the lock (not merely an efficiency optimization where occasional double-work is tolerable), don't use Redlock at all — use a proper consensus-backed system (ZooKeeper, or etcd, both directly connecting to Lesson 3's consensus content, and typically consumed via a well-tested client library implementing the correct locking recipe, such as Apache Curator's ZooKeeper recipes, rather than hand-rolled). These systems provide the same fencing-token mechanism as a first-class, well-tested feature, precisely because they're built on the consensus foundation (Lesson 3) that makes reasoning about correctness under partial failure actually tractable, rather than bolted onto a system (plain Redis) that was never designed with that guarantee as a primary goal.

**When a Redis-based lock genuinely is the right, appropriate tool — the other, equally important half of this lesson, since "never use Redlock" isn't quite the correct universal takeaway either:** for **efficiency locks** — where the lock's only purpose is avoiding redundant, wasted work (Module 5, Lesson 3's cache-stampede locking is precisely this category — if the lock occasionally fails and two workers redundantly regenerate the same cache entry, the cost is some wasted computation, not a corrupted, incorrect result) — a simple Redis `SET NX EX` lock is genuinely appropriate, fast, and simple, exactly matching Kleppmann's own stated distinction between efficiency-optimization locks and correctness-critical locks.

## 4. How it works internally

A fencing-token-aware resource (a database table, an object-storage write API) typically implements the check as a simple, atomic conditional write — `UPDATE resource SET data = $1, token = $2 WHERE token < $2` — leaning on exactly Module 3, Lesson 6's row-level locking and atomicity guarantees to make the fencing check itself race-free, closing the loop between this lesson's distributed-systems content and Module 3's single-database mechanics.

## 5. Example

```
Client A: acquires lock, token=33
Client A: [GC pause of 45 seconds — lock TTL was 30 seconds]
Client B: lock expired, acquires lock, token=34
Client B: writes to resource with token=34 — accepted, resource now at token 34
Client A: resumes, writes to resource with token=33 — REJECTED (33 < 34)
```

## 6. Code

```ts
// Resource-side fencing check — the actual correctness mechanism,
// living on the PROTECTED RESOURCE, not the lock service:
async function writeWithFencing(resourceId: string, token: number, data: unknown) {
  const result = await db.query(
    `UPDATE resources SET data = $1, fencing_token = $2
     WHERE id = $3 AND fencing_token < $2`,
    [data, token, resourceId],
  );
  if (result.rowCount === 0) {
    throw new Error('Stale fencing token — a newer lock holder has already acted');
  }
}
```

## 7. Failure scenarios

- **The process-pause scenario itself**, exactly as traced above — a real, well-documented, entirely realistic failure mode (garbage collection alone is sufficient to trigger it) that a TTL-based lock without fencing tokens simply cannot prevent.
- **Using Redlock for a genuinely correctness-critical operation** (Project 2's ledger being the clearest example in this curriculum) — precisely the "neither fish nor fowl" misuse Kleppmann's critique warns against.
- **Adding fencing tokens to the lock but forgetting to make the protected resource actually check them** — the token exists but does nothing, since the enforcement must live on the resource side, not merely be generated by the lock service.

## 8. Common misconceptions

- **"A distributed lock is just a mutex over the network."** The roadmap's own flagged misconception — a real single-process mutex relies on OS-level guarantees about execution that simply have no equivalent across independent, potentially-paused processes communicating over an unreliable network.
- **"Redlock's multi-instance majority requirement makes it safe for correctness-critical use."** It makes it more available/fault-tolerant against a single Redis instance dying — it does nothing about the process-pause problem, which is Kleppmann's actual, specific critique.
- **"Fencing tokens are a property of the lock."** They're generated by the lock service, but their actual enforcement — the part that makes them work — must live on the protected resource itself, a real, easy-to-miss implementation requirement.

## 9. Trade-offs

Simple Redis locks (no fencing): fast, simple, genuinely appropriate for efficiency-only locking where occasional violation is a tolerable cost. Fencing-token-aware locking with a proper consensus-backed service: real additional implementation complexity (the resource itself must cooperate), genuinely necessary for anything where a lock violation would mean actual data corruption or incorrect business outcomes.

## 10. Real-world applications

- Module 5, Lesson 3's cache-stampede lock is a legitimate, correct use of simple Redis locking — worth explicitly recognizing that connection, since it demonstrates this lesson's "right tool for the right category" point concretely rather than abstractly.
- Any system coordinating exclusive access to a genuinely critical resource (a payment processor ensuring only one process handles a specific transaction, directly relevant to Project 2) needs this lesson's fencing-token discipline, not a bare TTL-based lock.

## 11. Connections

Directly extends Module 5, Lesson 3 (contrasting cache-stampede locking's legitimate simplicity against this lesson's correctness-critical case) and Module 3, Lesson 6 (row-level locking's atomicity is exactly what makes a fencing check itself safe to implement). Depends on Lesson 3's consensus content (a proper distributed lock service is built on consensus) and Lesson 4's failure-detection content (a lock's TTL is itself a crude failure detector, with exactly that lesson's inherent uncertainty).

## 12. Practical exercise

Implement the fencing-token check from this lesson's code example, then write a test simulating the exact process-pause scenario (acquire a lock, simulate a pause past the TTL by manually expiring it, have a second "client" acquire the lock and write with a new token, then have the first client attempt its now-stale write) and confirm the fencing check correctly rejects it.

## 13. Challenge

For Project 2, identify every operation that requires a distributed lock (if any, given your architecture from earlier project work), and for each, classify it as an efficiency lock or a correctness-critical lock using Kleppmann's distinction, then design the appropriate mechanism (simple Redis lock, or fencing-token-aware locking via a consensus-backed service) for each.

## 14. Mastery test

- Trace through the process-pause failure scenario precisely enough to explain exactly why Redlock's multi-instance majority doesn't prevent it.
- Explain fencing tokens well enough to state exactly where the actual enforcement must live, and why generating the token alone is insufficient.
- Given a described locking use case (in conversation), classify it as an efficiency lock or a correctness-critical lock and justify the appropriate mechanism.
