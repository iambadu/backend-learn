# Delivery Semantics & Idempotent Consumers — Why "Exactly-Once" Is a Careful Lie

## 1. Why does this exist?

This lesson exists to permanently retire one specific, extremely common piece of loose talk: "our system guarantees exactly-once delivery." The roadmap flags "exactly-once delivery is guaranteed" as a misconception for good reason — it's not merely optimistic, it's provably impossible to guarantee in the strict sense the phrase implies, for reasons this lesson makes precise. What's actually achievable, and what production systems that advertise "exactly-once" really mean, is a specific, narrower, entirely different guarantee — and the gap between the two is exactly where real bugs live.

## 2. Mental model

Imagine mailing a letter and never being sure whether it arrived — your only tools are "send it and hope" (at-most-once: maybe it arrives, maybe it doesn't, but you never send a duplicate) or "keep resending until you get a confirmation" (at-least-once: it will arrive, but the recipient might get several copies if your confirmations themselves get lost). There is no third option where you can somehow guarantee it arrives exactly once without either occasionally losing it or occasionally duplicating it — not because engineers haven't tried hard enough, but because of a fundamental limit on what an unreliable network can prove to two parties.

## 3. Technical explanation

**The three delivery semantics, precisely:**
- **At-most-once**: a message is delivered zero or one times — never redelivered even if the consumer's acknowledgment is lost, meaning messages *can* be silently dropped on failure. Achieved by acknowledging (or considering delivered) *before* processing completes — simplest, fastest, but genuinely loses messages under failure.
- **At-least-once**: a message is delivered one or more times — never silently dropped, but the same message can arrive and be processed more than once if an acknowledgment is lost after successful processing but before the broker learns about it (the consumer processed it, crashed or had a network blip before acknowledging, and the broker, having never received confirmation, redelivers it to another consumer). Achieved by acknowledging *after* processing completes — the overwhelmingly dominant, practical default for real systems, because losing messages is almost always worse than occasionally duplicating them.
- **Exactly-once**: delivered and processed exactly one time, no losses, no duplicates — genuinely impossible to guarantee at the pure message-delivery layer across an unreliable network, for a reason with actual theoretical grounding, not just engineering pessimism.

**Why exactly-once delivery is provably impossible, not just hard — the actual argument, worth knowing precisely rather than accepting on authority:** this connects directly to the **Two Generals Problem**, a classical distributed-systems thought experiment: two generals must coordinate an attack via messengers who might be captured (messages might be lost) — no matter how many confirmation messages they exchange, neither general can ever be **certain** the other received the final confirmation, because that confirmation itself could be lost, requiring another confirmation, ad infinitum. Applied to message delivery: a consumer can't tell a broker "I successfully processed this" without that acknowledgment itself being a message that can be lost — and if it's lost, the broker (having no way to distinguish "the consumer never processed it" from "the consumer processed it but the ack didn't arrive") must choose between potentially losing the message (don't redeliver) or potentially duplicating it (redeliver just in case) — there is no third choice available given genuinely unreliable communication with finite messages.

**What "exactly-once" actually means when Kafka, or any serious system, claims it — the specific, narrower, genuinely achievable reframing:** it means that **within a defined transaction boundary**, the *effect* of processing a message is applied exactly once — achieved not by somehow preventing duplicate delivery at the network layer (impossible, per above), but by combining at-least-once delivery with **idempotent processing**, so that even if the same message is delivered and processed multiple times, the *observable result* is identical to processing it once. This is the exact same idempotency-key mechanism from Module 2, Lesson 8, now applied to asynchronous message consumption instead of synchronous HTTP requests — the underlying principle (make redelivery/retry harmless by design, rather than trying to prevent it from ever happening) is identical; only the transport layer differs.

**Idempotent consumers, concretely — the practical, achievable answer to this entire problem, and the one every production system should actually rely on:** design every consumer so that processing the same message twice has no additional effect beyond processing it once. Concrete techniques: track processed message IDs (Module 2, Lesson 9's webhook-processed-ID tracking, applied here identically) and skip any message whose ID has already been recorded as processed; design the underlying operation itself to be naturally idempotent (an `UPDATE ... SET status = 'shipped'` is idempotent regardless of how many times it runs; an `UPDATE ... SET stock = stock - 1` is not, and needs either a processed-ID guard or restructuring, e.g., `UPDATE ... SET stock = stock - 1 WHERE order_id NOT IN (SELECT order_id FROM processed_orders)` executed atomically). This is precisely why Module 2, Lesson 9 stated a background job worker "must be written idempotent by default, not as an afterthought" — this lesson is the full theoretical grounding for why that requirement isn't optional caution, it's the *only* correct response to a mathematically unavoidable delivery-semantics limitation.

## 4. How it works internally

An at-least-once consumer's correct processing sequence, made precise: receive message → process it (perform the actual business logic) → **only then** acknowledge it to the broker. If the consumer crashes between "process" and "acknowledge," the broker, having received no acknowledgment, redelivers the message to another (or the same, once restarted) consumer — this is precisely why idempotency is load-bearing, not optional: this exact crash-timing scenario is a real, common, unavoidable occurrence in any long-running production system, not a rare edge case.

## 5. Example

```ts
async function consumeMessage(msg: Message) {
  const alreadyProcessed = await db.query(
    'SELECT 1 FROM processed_messages WHERE message_id = $1', [msg.id]
  );
  if (alreadyProcessed.rows.length > 0) {
    await msg.ack(); // safe no-op — already handled, just acknowledge and move on
    return;
  }

  await db.transaction(async (tx) => {
    await handleBusinessLogic(tx, msg);
    await tx.query('INSERT INTO processed_messages (message_id) VALUES ($1)', [msg.id]);
  });
  await msg.ack();
}
```

## 6. Failure scenarios

- **Acknowledging before processing (mistakenly implementing at-most-once when at-least-once was intended)** — a consumer crash after acknowledgment but before completing the actual work silently loses that message forever, with no redelivery, since the broker already considers it delivered.
- **A non-idempotent consumer under normal, expected at-least-once redelivery** — a payment processed twice, an email sent twice, a stock count decremented twice — the exact real-world consequence of skipping idempotency, not a hypothetical.
- **Trusting a vendor's "exactly-once" marketing claim literally**, without checking what transaction boundary and idempotency mechanism it actually relies on underneath — leads to genuine surprise when duplicate processing does occur outside whatever specific boundary the guarantee was actually scoped to.

## 7. Common misconceptions

- **"Exactly-once delivery is guaranteed by [some specific technology]."** The roadmap's own flagged misconception — no technology guarantees exactly-once *delivery* over an unreliable network; what's achievable is exactly-once *processing effect*, via idempotency layered on top of at-least-once delivery.
- **"At-least-once delivery is a design flaw to be avoided."** It's the correct, deliberate default for almost every real system — the flaw would be building a consumer that isn't idempotent, not choosing at-least-once semantics in the first place.
- **"Idempotency is only needed for payment-adjacent systems."** Any consumer processing a message with a side effect (Module 2, Lesson 9's framing, applied identically here) needs it — sending an email, decrementing inventory, and processing a payment are the same underlying problem at different stakes levels.

## 8. Trade-offs

At-most-once: simple, no duplicate-handling logic needed, real risk of silent message loss. At-least-once plus idempotent consumers: no message loss, requires deliberate idempotency design (a processed-ID table, or naturally idempotent operations), genuinely more implementation discipline — but this is the only combination that's both loss-safe and correctness-safe, which is exactly why it's the dominant real-world default despite its extra design cost.

## 9. Real-world applications

- Every payment-processing system (Project 2, directly) treats at-least-once-plus-idempotency as non-negotiable — a payment provider's webhook (Module 2, Lesson 9) and any internal queue-based payment processing both rely on exactly this pattern.
- Kafka's own "exactly-once semantics" (Confluent's own documented framing) is explicitly scoped to transactions spanning Kafka's own producer/consumer/state-store boundary — a genuinely narrower, more specific guarantee than the marketing phrase alone implies, exactly illustrating this lesson's core point.

## 10. Connections

Directly extends Module 2, Lesson 8 (idempotency keys) and Lesson 9 (idempotent job workers, processed-ID tracking) — this lesson supplies the theoretical grounding (the Two Generals Problem) for why those patterns are the *only* correct response, not merely a good practice among alternatives. Sets up Lesson 4 and 5 (RabbitMQ and Kafka's specific acknowledgment mechanisms, which implement exactly the semantics this lesson defines abstractly).

## 11. Practical exercise

Implement the idempotent-consumer pattern above, then write a test that delivers the identical message twice (simulating redelivery after a lost acknowledgment) and confirms the underlying business effect (e.g., a row count, a balance change) occurs exactly once despite two processing attempts.

## 12. Challenge

Explain the Two Generals Problem well enough, in your own words, to convince a skeptical colleague who insists "our message queue vendor guarantees exactly-once, so we don't need idempotent consumers" that they're wrong — and identify specifically what narrower guarantee their vendor is actually providing.

## 13. Mastery test

- Explain the Two Generals Problem and its direct application to why exactly-once message delivery is impossible, not just difficult.
- Explain precisely what "exactly-once semantics" actually means in systems that advertise it, and how it differs from exactly-once delivery.
- Explain why acknowledging before processing produces at-most-once semantics, and why acknowledging after processing produces at-least-once semantics — trace the crash-timing logic for each.
- Design an idempotent version of a described non-idempotent operation (given in conversation), using either a processed-ID guard or a naturally idempotent restructuring.
