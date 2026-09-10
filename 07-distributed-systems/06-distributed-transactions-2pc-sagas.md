# Distributed Transactions — Two-Phase Commit & Sagas

## 1. Why does this exist?

Module 3, Lesson 5 was explicit that a single database transaction cannot span an external system — a payment API call inside a transaction that later rolls back leaves that external call orphaned, with no way to undo it. This lesson is the direct, full treatment of the problem that limitation creates: how do you get an all-or-nothing guarantee across multiple independent services or databases, each with their own separate transaction boundary, when no single ACID transaction can wrap all of them together?

## 2. Mental model

Two-Phase Commit is a wedding where the officiant asks every guest privately "are you certain you're ready for this to happen?" and only proceeds once every single guest has said yes — if even one hesitates, the whole thing is called off, and everyone who already said yes has to un-say it. A Saga is instead a sequence of individually-committed small ceremonies, where if a later one fails, you don't undo time — you perform a deliberate, compensating action (an annulment, not a magical erasure) to make things right going forward.

## 3. Technical explanation

**Two-Phase Commit (2PC), precisely:** a **coordinator** manages the transaction across multiple **participants** (each its own database or service). **Phase 1 (prepare)**: the coordinator asks every participant "can you commit this?" — each participant does whatever work is needed to *guarantee* it can commit if asked (acquiring locks, writing to a durable log — Module 3, Lesson 5's WAL content, applied per-participant) and responds yes or no, without yet actually committing. **Phase 2 (commit/abort)**: if **every** participant said yes, the coordinator tells all of them to commit; if **any** participant said no (or failed to respond), the coordinator tells all of them to abort. This achieves genuine atomicity across multiple independent systems — but at a real, structural cost worth naming precisely: every participant must hold its locks and prepared-but-uncommitted state for the **entire duration** of the protocol, including the round trip to every other participant — this is a synchronous, blocking protocol, and it degrades badly under latency or partial failure (a documented, commonly-cited estimate puts 2PC's throughput cost at roughly 30-40% reduction from the prepare/commit locking overhead alone, and that's before accounting for what happens when a participant or the coordinator itself fails mid-protocol).

**2PC's specific, well-known failure mode — the coordinator crashing between phases, worth understanding precisely because it's the protocol's genuine Achilles' heel:** if the coordinator crashes after collecting all "yes" votes but before sending the final commit/abort decision, every participant is left **blocked**, holding its prepared state and locks indefinitely, unable to unilaterally decide whether to commit or abort (a participant that already said "yes" cannot safely abort on its own, since the coordinator might have already told other participants to commit) — this is a real, structural single-point-of-failure risk in the protocol itself, not an implementation bug, and it's precisely why 2PC has fallen out of favor for most modern, high-availability distributed systems despite providing the strongest possible atomicity guarantee.

**The Saga pattern — the dominant, practical alternative, trading strict atomicity for availability and scalability, directly echoing Lesson 1's PACELC framing:** a saga breaks a distributed operation into a sequence of **local transactions**, each committed independently and immediately within its own service's own database (a genuine, real ACID commit, Module 3, Lesson 5, just scoped to one service at a time rather than spanning all of them). If a later step in the sequence fails, the saga executes **compensating transactions** — deliberate, explicit operations that semantically undo the effect of each already-completed prior step, in reverse order. Critically: a compensating transaction is **not** a rollback in the ACID sense — it's a new, forward-moving operation (e.g., "refund the charge" rather than "pretend the charge never happened") because the original step already committed and is potentially visible to other parts of the system; sagas provide **eventual consistency** (Lesson 2) across the whole sequence, not strict atomicity — during the window between a partial failure and the compensating transactions completing, the overall system is in a genuinely, visibly inconsistent intermediate state.

**Choreography vs. orchestration — the two ways a saga's sequence of steps and compensations actually gets coordinated, a real, consequential architectural choice within the saga pattern itself:** in a **choreographed** saga, each service listens for events from the previous step and publishes its own event when done, with no central coordinator — genuinely decentralized, but the overall sequence's logic is implicit, scattered across every participating service's event-handling code, making the end-to-end flow hard to see in any one place. In an **orchestrated** saga, a central orchestrator explicitly calls each step in sequence and explicitly triggers compensations on failure — the overall flow is visible in one place, at the cost of that orchestrator becoming a real, if not correctness-critical (unlike 2PC's coordinator, an orchestrator's own failure doesn't leave participants blocked holding locks — each step already committed independently), central piece of infrastructure.

**The genuinely hard, often-underestimated part of designing a saga — writing correct compensating transactions, worth naming explicitly since it's where most of the real design difficulty actually lives:** a compensating transaction must correctly undo a step's *business effect*, which is often not a clean, symmetric inverse — "cancel a reservation" might be a clean compensation for "reserve inventory," but "refund a payment" is a compensation for "charge a payment" only in a business sense (it involves a new transaction, potential fees, and a real, visible record of both the original charge and the refund — it is not equivalent to "the charge never happened," and any downstream system or user that observed the original charge needs to correctly handle seeing both events).

## 4. How it works internally

An orchestrated saga for Project 2's "process an order" flow (charge payment → reserve inventory → schedule shipping) runs each step as its own local transaction in its own service; if inventory reservation fails after payment succeeded, the orchestrator triggers the payment service's compensating "refund" transaction — the orchestrator's own state (which steps have completed, which compensations are pending) needs to be durably tracked (typically in its own database, using exactly Module 2, Lesson 9's transactional-outbox pattern to reliably trigger each next step or compensation) so that an orchestrator crash mid-saga doesn't lose track of where the saga was.

## 5. Example

```
Saga: Place Order
1. charge_payment(order)         → committed
2. reserve_inventory(order)      → FAILS (out of stock)
Compensation (reverse order):
1. refund_payment(order)         → new, forward-moving transaction,
                                    NOT an undo of step 1's commit
```

## 6. Code

```ts
// Orchestrated saga, illustrative structure:
async function placeOrderSaga(order: Order) {
  const completedSteps: string[] = [];
  try {
    await chargePayment(order); completedSteps.push('payment');
    await reserveInventory(order); completedSteps.push('inventory');
    await scheduleShipping(order); completedSteps.push('shipping');
  } catch (err) {
    for (const step of completedSteps.reverse()) {
      await compensate(step, order); // refund_payment, release_inventory, etc.
    }
    throw err;
  }
}
```

## 7. Failure scenarios

- **A 2PC coordinator crashing between phases**, leaving every participant blocked holding locks indefinitely — the protocol's well-known structural weakness, a real reason it's rarely chosen for new, high-availability systems.
- **A saga's compensating transaction itself failing** (e.g., a refund attempt fails because the payment provider is briefly down) — sagas need their own retry/backoff logic (Module 6, Lesson 2) around compensations, and a genuinely robust design needs a plan for a compensation that keeps failing (often: alert a human, exactly the DLQ-as-visibility principle from Module 6, Lesson 2, applied here).
- **A downstream system or user observing a saga's intermediate, partially-completed state** (payment charged, inventory not yet confirmed) before compensation completes — a real, visible consequence of sagas' eventual-consistency-only guarantee that must be designed for explicitly (e.g., showing an order as "processing," not "confirmed," until every step succeeds), not an edge case to ignore.

## 8. Common misconceptions

- **"A saga is just a distributed transaction with a different name."** It provides a genuinely weaker, different guarantee (eventual consistency via compensation) than a real ACID transaction (Module 3, Lesson 5) or even 2PC's strict atomicity — the name change reflects a real, substantive difference in what's guaranteed, not a rebrand.
- **"Compensating transactions are rollbacks."** A rollback (Module 3, Lesson 5) undoes uncommitted work as if it never happened; a compensation is a new, forward transaction addressing the business consequence of already-committed work — genuinely different in kind, not just terminology.
- **"2PC is simply the 'more correct' choice, and sagas are a compromise for lazy engineering."** 2PC provides a genuinely stronger guarantee at a genuinely severe availability cost (its blocking failure mode) — for most modern, high-availability distributed systems, that trade is a poor one, which is precisely why sagas dominate in practice, not because engineers are cutting corners.

## 9. Trade-offs

2PC: strict atomicity across services, real blocking/availability risk on coordinator failure, real throughput cost from held locks during the protocol. Sagas: no blocking, real availability and scalability, only eventual consistency with a genuinely visible intermediate-inconsistency window, and real design difficulty in correctly specifying every compensating transaction.

## 10. Real-world applications

- Project 2's multi-step order/payment flow (charge, reserve, ship) is the textbook saga use case in this entire curriculum — directly, immediately applicable, not hypothetical.
- Most modern microservices architectures (Level 8) explicitly choose sagas over 2PC for cross-service workflows, precisely because of 2PC's availability cost at scale.

## 11. Connections

Directly resolves Module 3, Lesson 5's "a transaction cannot safely wrap an external side effect" failure scenario with this lesson's full treatment. Connects to Lesson 1 (2PC vs. saga is a direct PACELC-style consistency/availability trade) and Module 2, Lesson 9's transactional outbox (needed to reliably drive an orchestrated saga's steps). Sets up Level 8's microservices/event-driven architecture content.

## 12. Practical exercise

Design the full saga (steps and compensations, choreographed or orchestrated, and why) for a described multi-service checkout flow (given in conversation), explicitly identifying what intermediate state is visible to a user or other system during a partial failure, and how your design handles it.

## 13. Challenge

For Project 2, decide explicitly between 2PC and a saga for the core "process a payment across multiple internal services" flow, and defend the choice using this lesson's specific trade-offs — including a concrete answer for what happens if a compensating transaction itself fails repeatedly.

## 14. Mastery test

- Explain 2PC's two phases precisely, and the specific failure scenario (coordinator crash timing) that produces its blocking problem.
- Explain why a compensating transaction is not a rollback, using a concrete example where the distinction has a real, visible consequence.
- Distinguish choreographed and orchestrated sagas by where the overall flow's logic lives, and the trade-off each implies.
- Given a described multi-step business process (in conversation), design its saga and identify the hardest compensating transaction to get right, and why.
