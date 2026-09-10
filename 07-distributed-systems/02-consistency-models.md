# Consistency Models — The Spectrum Between Linearizable and Eventually Consistent

## 1. Why does this exist?

Lesson 1 established that consistency is something you trade for availability or latency — this lesson is the actual menu of specific, named consistency guarantees you can choose from along that trade-off, each with a precise definition, not a vague feeling of "pretty consistent." "Eventual consistency" is the term most developers have heard; it's also just one point on a much richer spectrum, and the roadmap's flagged misconception ("more replicas means more consistency") is best corrected by actually knowing this spectrum precisely.

## 2. Mental model

Think of consistency models as answering, with increasing strictness, the question "in what order am I guaranteed to see things happen?" Linearizability says "exactly the order they really happened, as if there were only ever one copy of the data." Causal consistency says "at least the order that cause-and-effect requires, though unrelated things might appear in any order." Eventual consistency says "no ordering promise at all, except that if everyone stops writing, everyone eventually agrees."

## 3. Technical explanation

**Linearizability (strong consistency) — the strictest, most intuitive-feeling guarantee, and the most expensive to provide:** every operation appears to take effect atomically, at some point between when it was invoked and when it completed, and every client sees operations in a single, globally agreed order that's consistent with real time — if operation A completes before operation B begins (in real, wall-clock time), every client must see A's effect before B's. This is the guarantee that matches naive intuition about "a single copy of the data" — and providing it across multiple nodes requires real, expensive coordination (Lesson 3's consensus protocols) on every operation, which is precisely Lesson 1's Latency cost of PACELC's "else" branch.

**Causal consistency — a genuinely useful middle ground, worth knowing precisely because it's frequently the actual right answer, not just a compromise:** operations that are **causally related** (one could plausibly have influenced the other — Lesson 7's Lamport/vector-clock content formalizes "causally related" precisely) must be seen by everyone in the same, correct order; operations that are **concurrent** (causally unrelated — neither could have known about the other) can be seen in different orders by different observers, without that being considered a violation. A concrete, intuitive example: if you post a comment, then reply to your own comment, everyone must see the original comment *before* the reply (a real causal dependency — the reply couldn't exist first) — but two *unrelated* comments from different users posted at roughly the same time can legitimately appear in a different order to different viewers, without anything being "wrong."

**Eventual consistency — the weakest, cheapest, most available guarantee, and precisely what it does and doesn't promise:** the only guarantee is that **if no new writes occur, all replicas will eventually converge to the same state** — there's no bound on *how long* "eventually" takes, and no guarantee about what order intermediate reads see. This is genuinely appropriate for data where staleness is cheap and convergence is all that matters (Module 5's caching content is, structurally, an eventual-consistency system — a cache and its source of truth converge eventually, given no further writes, exactly matching this definition) — and genuinely inappropriate for anything where the *order* operations are observed in has real consequences (Project 2's transaction history, where seeing a debit before its corresponding earlier credit would represent a real, visible violation of causality a user would immediately notice as wrong).

**Read-your-own-writes and session consistency — a specific, pragmatic, partial guarantee worth naming because it directly resolves a bug you've already encountered:** Module 3, Lesson 9 named the "read-your-own-writes" bug (submitting data, then not seeing it immediately on a read-replica-backed read) as a real, common consequence of asynchronous replication. **Session consistency** is the specific, named consistency model guaranteeing that within a single client's own session, that client always sees the effects of its own prior writes, even if other clients might not yet — commonly implemented by routing a client's reads to the same node/replica their writes went to (directly connecting to Lesson 1's "session stickiness" mention as a real, partial guarantee achievable even under a weaker global consistency model), rather than requiring global strong consistency just to fix this one specific, narrower problem.

**Why "more replicas means more consistency" is precisely backwards, mechanically, not just as an assertion — the roadmap's flagged misconception, now fully grounded:** more replicas mean more copies of the data that need to agree before a strongly-consistent operation can complete — each additional replica is an *additional* node whose acknowledgment (or, under a quorum scheme, a sufficient subset's acknowledgment) a write might need to wait for, which is strictly more coordination overhead, not less. What more replicas genuinely buy you is more **read capacity** (more nodes able to serve reads) and more **fault tolerance** (surviving more simultaneous node failures) — neither of which is "consistency." Confusing these three genuinely separate benefits (consistency, read capacity, fault tolerance) is exactly what produces this misconception, and precisely why this lesson insists on naming each one separately rather than lumping them together as generically "better."

## 4. How it works internally

A quorum-based system (a real, common technique achieving tunable consistency without requiring literally every replica to participate in every operation) requires a write to be acknowledged by `W` replicas and a read to be acknowledged by `R` replicas out of `N` total, such that `W + R > N` — this guarantees any read quorum and any write quorum overlap in at least one replica, meaning a read is guaranteed to see the most recent write, achieving strong consistency without needing all `N` replicas to participate in every single operation, a genuinely elegant middle ground between "every replica, every time" and "no coordination at all."

## 5. Example

```
N = 5 replicas, W = 3, R = 3   → W + R (6) > N (5): strongly consistent reads
N = 5 replicas, W = 1, R = 1   → W + R (2) < N (5): fast, but a read might miss the latest write
```
This single formula is the concrete, tunable knob many real distributed databases (Cassandra, DynamoDB) expose directly to you — the abstract consistency-model spectrum this lesson describes, made into an actual configuration parameter.

## 6. Code

```ts
// Session consistency, concretely: pin a user's reads to the replica
// their own writes are known to have reached, rather than requiring
// global strong consistency just to fix "I can't see my own write."
async function readAfterWrite(userId: string, key: string) {
  const replicaId = await getRecentWriteReplica(userId); // "sticky" routing
  return replicaFor(replicaId).read(key);
}
```

## 7. Failure scenarios

- **Assuming eventual consistency for data where operation order has real consequences** — Project 2's transaction history, or Module 3, Lesson 2's ledger content, both genuinely need at least causal consistency (a credit must never be seen after a later debit it enabled), and eventual consistency alone provides no such guarantee.
- **Adding replicas expecting stronger consistency**, when the actual effect (per this lesson's mechanical explanation) is more read capacity and fault tolerance, with consistency, if anything, requiring *more* coordination as a result, not less.
- **Choosing `W=1, R=1` quorum settings for correctness-critical data** to optimize for latency, without realizing this explicitly forfeits the read-sees-latest-write guarantee the `W+R > N` formula would otherwise provide.

## 8. Common misconceptions

- **"More replicas means more consistency."** The roadmap's own flagged misconception — mechanically backwards; more replicas mean more read capacity and fault tolerance, and if anything, more coordination overhead for a given consistency level.
- **"Eventual consistency and 'roughly consistent' are the same thing."** Eventual consistency is a precise, named guarantee (convergence given no further writes, no ordering promise otherwise) — "roughly consistent" is not a real guarantee at all, and conflating a vague intuition with this lesson's precise term is exactly the imprecision this curriculum is built to eliminate.
- **"Causal consistency is basically the same as eventual consistency, just with a fancier name."** It's a genuinely stronger guarantee — it constrains ordering for causally related operations specifically, something eventual consistency makes no promise about at all.

## 9. Trade-offs

Linearizability: strongest, most intuitive guarantee, highest coordination cost (Lesson 3's consensus overhead on every operation). Causal consistency: a real, useful middle ground for systems where cause-and-effect ordering matters but full global ordering doesn't. Eventual consistency: cheapest, most available, appropriate only where order genuinely doesn't matter and convergence alone is sufficient.

## 10. Real-world applications

- Module 5's caching content is, precisely, an eventual-consistency system — worth explicitly recognizing that connection, since it means you've already been reasoning about this model without the formal vocabulary.
- Quorum-tunable databases (Cassandra, DynamoDB, and equivalents) expose exactly the `W`/`R`/`N` knob from this lesson directly in their configuration — real, hands-on application of this abstract content.

## 11. Connections

Directly extends Lesson 1's CAP/PACELC framing with the actual named models available along that trade-off. Depends on Lesson 7's happens-before/causality content for causal consistency's precise definition, and connects to Module 3, Lesson 9's read-your-own-writes bug (session consistency is its named, formal fix).

## 12. Practical exercise

For each of: a chat application's message ordering, a "likes" counter on a post, and Project 2's transaction ledger, determine the minimum consistency model (from this lesson's spectrum) actually required for correct behavior, and justify why a weaker model would produce a real, user-visible bug for each.

## 13. Challenge

Design Project 2's consistency model explicitly: which specific operations require linearizability, which can tolerate causal consistency, and which (if any) can safely use eventual consistency — using this lesson's precise definitions to justify each boundary, not a blanket "everything must be strongly consistent."

## 14. Mastery test

- Define linearizability, causal consistency, and eventual consistency precisely enough to correctly classify a given system's behavior from a description of what it guarantees.
- Explain the quorum formula `W + R > N` and why it guarantees a read sees the latest write.
- Explain, mechanically, why more replicas doesn't mean more consistency, distinguishing consistency from read capacity and fault tolerance.
- Explain session consistency and why it's a more targeted, appropriate fix for the read-your-own-writes problem than requiring global strong consistency.
