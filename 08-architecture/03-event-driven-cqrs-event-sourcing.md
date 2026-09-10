# Event-Driven Architecture, CQRS & Event Sourcing

## 1. Why does this exist?

Every architecture pattern in this lesson is, at its core, a specific answer to a question this curriculum has raised repeatedly: should a system be organized around its *current state*, or around the *history of changes* that produced that state? Module 3, Lesson 5's ACID transactions and Lesson 7's MVCC both quietly optimize for "give me the current, correct state efficiently" — this lesson covers the alternative philosophy, and the very real, specific trade-offs that come with committing to it.

## 2. Mental model

A traditional database is a whiteboard that gets erased and rewritten with each update — you can always see the current picture, but you've lost every earlier version unless you specifically kept a copy. Event sourcing is a diary — every entry is permanent, nothing is ever erased, and "the current picture" is something you *derive* by reading the whole diary from the start (or from a recent snapshot), not something stored directly as its own artifact.

## 3. Technical explanation

**Event-driven architecture — the loosest, most general commitment: services communicate primarily by publishing and reacting to events rather than direct, synchronous calls:** a service that completes some meaningful business action publishes an event describing what happened ("OrderPlaced," "PaymentReceived" — deliberately named as a fact about the past, not a command); other services subscribe to events they care about and react independently, without the publishing service needing to know or care who's listening. This is Module 6's entire messaging content (queues, Kafka's topic model especially — Module 6, Lesson 5) applied specifically as an *architectural* organizing principle for how services relate to each other, not just a technique for offloading slow work.

**CQRS (Command Query Responsibility Segregation) — a genuinely separate, though frequently paired, decision: splitting the read and write paths into entirely separate models:** in a traditional design, one model (one set of entities, one schema) serves both writes (commands — "place this order") and reads (queries — "show me this customer's order history"). CQRS deliberately splits these into two separate models — a **write model** optimized for correctly enforcing business invariants (Lesson 2's aggregate discipline lives here) and a **read model** optimized purely for the specific query shapes the application actually needs, often denormalized (Module 3, Lesson 1's deliberate, accountable denormalization, applied here as a first-class architectural pattern rather than an exception) and even stored in an entirely different, purpose-fit database technology than the write side. The write model processes a command, and the resulting change is propagated (often via exactly this lesson's event-driven mechanism) to update the read model(s) asynchronously.

**Why CQRS's read/write split specifically solves a real, recurring problem, worth stating precisely rather than accepting on faith:** a single, shared model trying to serve both "correctly enforce every business invariant on write" and "answer every possible query shape efficiently" often serves *neither* well — a schema normalized enough (Module 3, Lesson 1) to keep writes correct and consistent is frequently a poor shape for read-heavy, denormalized query patterns (Module 3, Lesson 2's window-function-driven reporting queries are exactly the kind of read need that benefits from a purpose-built, denormalized read model rather than forcing a normalized write schema to serve them directly). CQRS names this tension explicitly and gives you permission to solve the two problems with two different, purpose-fit models instead of one compromised one.

**Event sourcing — the deepest, most consequential commitment of the three, and genuinely distinct from merely "using events for communication":** instead of storing an entity's **current state** directly, you store the complete, ordered sequence of **events** that produced that state, and derive the current state by replaying those events (a direct, conceptual extension of Module 3, Lesson 5's WAL-based durability mechanism and Module 3, Lesson 7's MVCC tuple-versioning — this curriculum has shown you this exact "store the log of changes, derive current state from it" idea twice already at the database-internals level; event sourcing simply promotes that same idea to be your *primary*, application-visible data model, rather than an internal database implementation detail). This is a genuinely powerful capability: you get complete historical traceability (exactly what happened, in what order, forever — directly valuable for Project 2's audit-log requirements) and the ability to rebuild any *new* read model or projection later, from the beginning, purely by replaying the same historical events — precisely the same capability Module 6, Lesson 5 highlighted as Kafka's distinctive advantage over a traditional queue (a new consumer group replaying the full historical stream), now applied as your system's core, primary persistence strategy rather than just a messaging transport property.

**Snapshots — the necessary, practical answer to event sourcing's real performance cost, worth knowing the specific threshold guidance for:** replaying every event from the beginning of time to reconstruct current state becomes genuinely expensive for a long-lived, frequently-modified entity (a bank account with years of transaction history) — a **snapshot** periodically captures the derived current state at a specific event-sequence position, so reconstructing "current state" means loading the most recent snapshot and replaying only the events *since* that snapshot, not the entire history. A commonly-cited, concrete guideline: snapshotting becomes worth the added complexity once replay time for a "hot" (frequently accessed) aggregate would otherwise exceed roughly 100ms — below that threshold, the added snapshotting machinery is often not worth its own complexity cost, a genuinely useful, concrete rule of thumb rather than "snapshot whenever it feels slow."

**Why these three patterns are frequently confused as one thing, and why they're actually separable, independent decisions worth pulling apart precisely:** you can adopt event-driven communication between services without CQRS or event sourcing at all (services simply notify each other of facts, each still storing its own current-state model conventionally). You can adopt CQRS without event sourcing (a write model using conventional current-state storage, Module 3, Lesson 5's ACID transactions, with reads served from a separately-maintained, denormalized projection kept in sync by ordinary application code or database triggers, not necessarily a full event log). Event sourcing, in practice, is almost always paired with CQRS (since deriving read-optimized projections from an event log is exactly what CQRS's read-model concept is for) — but the reverse isn't required, and treating "CQRS" and "event sourcing" as synonyms, or assuming adopting one requires the other, is a real, common source of over-engineering a system that only actually needed one of the three, independently-justifiable patterns.

## 4. How it works internally

An event-sourced `Account` aggregate (Lesson 2) reconstructs its current balance by loading its event stream (`AccountOpened`, `Deposited(100)`, `Withdrawn(30)`, ...) and folding over it — `balance = events.reduce((bal, event) => applyEvent(bal, event), initialState)` — this is, precisely, the same "replay the log to derive current state" operation Module 3, Lesson 5's crash-recovery WAL replay performs, and Module 3, Lesson 9's replica performs continuously — event sourcing is this exact, familiar mechanism, deliberately elevated to be the primary application data model rather than a database-internal recovery detail.

## 5. Example

```
Event log for account #42:
  AccountOpened { balance: 0 }
  Deposited { amount: 500 }
  Withdrawn { amount: 200 }
Current state (derived by replay): balance = 300

Snapshot at event #2: { balance: 500 } — a later replay only needs to
apply events AFTER this snapshot, not from the very beginning.
```

## 6. Code

```ts
// CQRS: separate write model (enforces invariants) and read model
// (denormalized, purpose-built for a specific query), kept in sync
// via an event this write operation publishes:
class AccountWriteModel {
  async withdraw(accountId: string, amount: number) {
    const account = await this.loadAggregate(accountId); // event-sourced reconstruction
    account.withdraw(amount); // enforces "cannot go negative" invariant, Lesson 2
    await this.eventStore.append(accountId, account.uncommittedEvents);
    await this.eventBus.publish(account.uncommittedEvents); // drives read-model update
  }
}

// A read model, denormalized purely for a specific dashboard query,
// updated asynchronously as events arrive — NOT the source of truth.
eventBus.subscribe('Withdrawn', async (event) => {
  await readDb.query('UPDATE account_summary SET balance = balance - $1 WHERE id = $2',
    [event.amount, event.accountId]);
});
```

## 7. Failure scenarios

- **Adopting full event sourcing for a system with no genuine need for historical replay or audit traceability** — real, ongoing complexity cost (event schema versioning as your domain model evolves, snapshot management, the conceptual overhead of "state is derived, not stored directly") paid for a capability the system never actually uses.
- **A CQRS read model falling behind the write model** (the asynchronous propagation lagging, Module 7 Lesson 2's eventual-consistency content applying directly) — a user seeing stale data on a read path immediately after a write, exactly Module 3 Lesson 9's read-your-own-writes problem, recurring here in an architectural pattern rather than a database-replication context.
- **Treating an event-sourced system's events as mutable** (editing a past event to "fix" a mistake, rather than appending a new, compensating event) — violates the entire, deliberate append-only premise event sourcing depends on, and destroys the historical-traceability guarantee that was the point of adopting it in the first place.

## 8. Common misconceptions

- **"CQRS and event sourcing are the same thing, or you need both together."** They're separable, independently justifiable decisions — CQRS's read/write split is broadly useful on its own; event sourcing is a much deeper, costlier commitment that happens to pair naturally with CQRS but isn't required by it.
- **"Event-driven architecture means you're doing event sourcing."** Publishing events for cross-service notification (Lesson content shared with Module 6) is a much lighter-weight, more common pattern than actually storing an entity's state as its full event history — conflating the two overstates how deep a commitment most event-driven systems have actually made.
- **"Event sourcing gives you free audit logging with no extra design work."** The event log is a real, deliberate artifact you must design carefully (naming events well, per Lesson 2's ubiquitous-language discipline, versioning event schemas as they evolve) — it's a genuine capability, not an automatic side effect of adopting the pattern loosely.

## 9. Trade-offs

Event-driven architecture: loose coupling between services, real eventual-consistency and debugging-complexity cost (Level 10 previews this). CQRS: purpose-fit read and write models, real synchronization/staleness cost between them. Event sourcing: complete historical traceability and replay capability, real, substantial complexity cost (snapshotting, event versioning, a genuinely different mental model for "what is the state") that should be adopted deliberately for a system that actually needs its specific benefits, not defaulted to.

## 10. Real-world applications

- Project 2's ledger is the single clearest, most directly justified event-sourcing candidate in this entire curriculum — a financial ledger's core requirement (a complete, immutable, replayable history of every transaction) is exactly event sourcing's core value proposition, not a stretch application of the pattern.
- CQRS without full event sourcing is common in reporting-heavy SaaS products (Project 4) where the write path's normalized schema and the dashboard's denormalized query needs genuinely benefit from separate models, without needing full historical replay capability.

## 11. Connections

Directly extends Module 3, Lesson 5 (WAL) and Lesson 7 (MVCC) — event sourcing promotes their internal "log of changes, derive current state" mechanism to your application's primary model. Depends on Lesson 2's aggregate discipline (an event-sourced aggregate's event stream is scoped exactly to that aggregate's boundary) and Module 6's messaging content (event propagation between write and read models leans directly on that module's delivery-semantics and idempotency content).

## 12. Practical exercise

Implement a minimal event-sourced `Account` aggregate (append-only event log, a fold function deriving current balance), then add a snapshot mechanism and confirm reconstruction from a snapshot plus subsequent events produces the identical result as full replay from the beginning.

## 13. Challenge

For Project 2, design the full event-sourced ledger: the event schema (what specific events exist, and what data each carries), the snapshot strategy and its trigger threshold, and the CQRS read model(s) your application's actual query needs require, justified against this lesson's specific guidance rather than defaulting to event-sourcing everything.

## 14. Mastery test

- Explain why event-driven architecture, CQRS, and event sourcing are three separable decisions, and give an example of adopting one without the others.
- Explain precisely how event sourcing's "derive state by replay" mechanism directly parallels Module 3's WAL and MVCC content.
- State the concrete snapshot-threshold guideline from this lesson and explain why it's a reasonable rule of thumb rather than an arbitrary number.
- Explain why editing a past event, rather than appending a compensating one, violates event sourcing's core premise.
