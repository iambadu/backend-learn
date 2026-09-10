# Module Exam — 06: Asynchronous Processing / Messaging

Cumulative test across Lessons 1–5. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. Explain what a queue guarantees and doesn't guarantee about work being completed.
2. Explain exponential backoff with jitter, naming at least two jitter strategies and what each trades.
3. Explain the Two Generals Problem and its application to why exactly-once delivery is impossible.
4. Distinguish at-most-once and at-least-once by ack/commit timing relative to processing.
5. Distinguish RabbitMQ's exchange/queue model from Kafka's partition/log model structurally, not just by name recognition.

## Section B — Explain in your own words

6. Explain why "async is always faster" is false, using this module's latency-relocation framing.
7. Explain why a dead-letter queue's purpose is visibility, not disposal.
8. Explain why Kafka guarantees ordering only within a partition, and what that means for message keying.
9. Explain why automatic acknowledgment in RabbitMQ is dangerous for production consumers.

## Section C — Scenario diagnosis

10. A downstream email provider has a brief outage, and your notification consumer's naive immediate-retry logic turns a 30-second blip into a 20-minute overload of the (now-recovering) provider. Diagnose and redesign.
11. A payment consumer processes the same payment twice after a consumer crash-and-restart, despite the queue technology being marketed as "exactly-once." Diagnose the actual root cause and the fix.
12. A Kafka consumer group's processing latency spikes briefly every time you deploy a new consumer version. Diagnose.

## Section D — Trade-off reasoning

13. Argue for RabbitMQ over Kafka (or vice versa) for Project 3's notification pipeline, using this module's architectural-contrast content, not general popularity.
14. Defend a specific DLQ retry-count and backoff-cap policy for a described consumer (given in conversation).

## Section E — System design

15. Design Project 3's complete messaging architecture: technology choice, topology (queues/exchanges or topics/partitions), delivery semantics and idempotency strategy, retry/backoff/DLQ policy — justified against this module's content throughout.

---

**On passing:** update `PROGRESS.md` — Module 6 complete, log mastery levels. Module 7 (Distributed Systems) unlocks next — per `ROADMAP.md`, this is the second-highest-leverage module in the curriculum.
