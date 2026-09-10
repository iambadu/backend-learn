# Kafka Concepts — Logs, Partitions, and Consumer Groups

## 1. Why does this exist?

This lesson is conceptual, not operational — you don't need to run a Kafka cluster to get value from understanding its model, because Kafka represents a genuinely different architectural philosophy from RabbitMQ's (Lesson 4), and the contrast between the two is itself the most valuable thing to internalize: RabbitMQ is a broker that routes and removes messages once consumed; Kafka is a durable, replayable log that consumers read from independently, without ever removing anything themselves.

## 2. Mental model

A RabbitMQ queue is a to-do list where completed items get crossed off and disappear. A Kafka topic is a append-only ledger, like Module 3's write-ahead log, that nothing ever erases (until a configured retention period elapses) — consumers don't "take" messages off it, they read from a specific position and can re-read from any earlier position at will, because the log itself doesn't know or care which consumers have "finished" with which messages.

## 3. Technical explanation

**Topics, partitions, and why partitioning exists — the mechanism behind Kafka's scalability, directly analogous to Module 3, Lesson 10's database partitioning/sharding content:** a Kafka **topic** (a named stream of messages) is split into multiple **partitions**, each an independent, strictly-ordered, append-only log. Splitting a topic into partitions is what allows parallel consumption (different partitions can be read by different consumers simultaneously) and horizontal write scaling (different partitions can be written to, and physically stored on, different brokers) — the exact same "split into pieces so no single machine bears the whole load" reasoning as Module 3, Lesson 10's sharding content, applied to a log instead of a table. **Ordering is guaranteed only within a single partition, never across partitions of the same topic** — a genuinely important, easy-to-miss constraint: if strict ordering matters for a set of related messages (e.g., all events for one specific order), they must be routed to the same partition, typically by keying messages on that order's ID so Kafka's default partitioning hashes them consistently to the same partition — directly echoing Module 5, Lesson 5's Redis Cluster hash-tag content, the same underlying need (colocate related items) solved the same way (a deterministic hash of a shared key).

**Offsets — how a consumer's position in a partition is tracked, and why this is fundamentally different from RabbitMQ's per-message acknowledgment model:** each message within a partition has a sequential **offset** (an incrementing integer). A consumer doesn't acknowledge individual messages the way a RabbitMQ consumer does — it periodically **commits** its current offset (its "I've processed up through here" position), typically stored in a special internal Kafka topic (`__consumer_offsets`). This is a structurally different failure-recovery model from RabbitMQ's: on restart, a consumer resumes from its last **committed offset**, not from wherever RabbitMQ's broker-tracked, per-message state happened to leave off — meaning offset-commit timing (before or after processing, exactly mirroring Lesson 3's ack-timing framing) determines Kafka's own at-most-once vs. at-least-once behavior, just via a positional commit rather than a per-message flag.

**Consumer groups — Kafka's mechanism for both parallel processing and independent, replayable consumption simultaneously, worth understanding precisely because it enables something RabbitMQ's model doesn't offer as naturally:** multiple consumer instances can join a named **consumer group**, and Kafka guarantees that within one group, each partition is assigned to exactly one consumer instance at a time — this is what gives you parallel processing (different partitions handled by different instances of the same logical consumer) without any single message being processed twice *within* that group under normal operation. Critically: **multiple independent consumer groups can each read the entire topic independently, from their own separately tracked offsets, without interfering with each other at all** — this is the genuinely distinctive capability Kafka's non-destructive-read log model provides that RabbitMQ's take-and-remove queue model structurally cannot: the same event stream can be replayed in full by a brand-new consumer group (e.g., a new analytics pipeline added months later) without needing the original producer to do anything differently, because nothing was ever removed from the log for anyone else's benefit.

**Replication — Kafka's durability and availability mechanism, directly analogous to Module 3, Lesson 9's Postgres replication content, applied to a partition instead of a whole database:** each partition has one **leader** broker (handling all reads and writes for that partition) and some number of **follower** brokers replicating it. If a leader fails, a follower is promoted — the same leader-election-and-failover pattern Level 7 will formalize generally, encountered here concretely for the second time in this curriculum (the first being Module 3, Lesson 9's Postgres primary/replica content).

**Rebalancing — the specific, real operational cost of consumer groups worth naming, since it's a genuine, common source of confusing production behavior:** when a consumer joins or leaves a group (a deploy, a crash, a scale-up), Kafka must **rebalance** — reassign partitions among the group's remaining/new members. During a rebalance, consumption from affected partitions briefly pauses, and depending on configuration, this can cause a visible, real latency blip in processing — a genuine operational cost of the consumer-group model, not a bug, but a real trade-off worth knowing about when reasoning about a Kafka-based system's behavior during deploys.

## 4. How it works internally

A producer writing to a Kafka topic specifies (explicitly or via a default partitioner using a message key's hash) which partition a message lands in; a broker acting as that partition's leader appends it to the partition's log on disk (an append-only write, cheap and fast, directly analogous to Module 3's WAL-based durability reasoning) and, per the topic's replication factor, ensures the configured number of followers have also received and acknowledged it before the write is considered fully durable.

## 5. Example

```
Topic: order-events (3 partitions)
Producer keys messages by order_id → all events for order #42 land on
the same partition, guaranteeing they're read in the order they were
written, by any single consumer processing that partition.
```

## 6. Code

```ts
// Kafka consumer: committing offsets AFTER processing — at-least-once,
// exactly Lesson 3's crash-timing logic, expressed via offset commits
// instead of per-message acknowledgments.
consumer.on('message', async (msg) => {
  await processOrderEvent(msg.value);
  await consumer.commitOffset(msg.partition, msg.offset); // after, not before
});
```

## 7. Failure scenarios

- **Keying messages inconsistently (or not at all) for a topic where cross-message ordering matters**, scattering related events across partitions and losing the ordering guarantee entirely, since ordering is only guaranteed within a single partition.
- **Committing offsets before processing completes** — converts the system to at-most-once semantics inadvertently, exactly Lesson 3's message-loss risk, now via premature offset commit instead of premature acknowledgment.
- **A rebalance triggered by a rolling deploy causing a visible processing-latency spike**, mistaken for a genuine performance regression rather than the expected, temporary cost of consumer-group reassignment.

## 8. Common misconceptions

- **"Kafka and RabbitMQ are interchangeable message queues, just different vendors."** They represent genuinely different architectural models (destructive queue-and-remove vs. durable, replayable, non-destructive log) suited to different needs — Kafka for high-throughput event streaming and multiple independent consumers replaying the same stream; RabbitMQ for flexible, broker-managed routing to distinct, typically single-purpose queues.
- **"Kafka guarantees global message ordering across a topic."** Only within a single partition — a genuinely important constraint that shapes how you must key messages for anything ordering-sensitive.
- **"More consumer instances in a group always means more parallelism."** Only up to the number of partitions — a consumer group with more instances than partitions leaves the extras idle, since a partition can only be assigned to one consumer within a group at a time.

## 9. Trade-offs

Kafka: genuinely high throughput, replayability, and support for multiple independent consumers reading the same stream — at the cost of real operational complexity (partition/replication/rebalancing management) and a structurally different mental model from a traditional queue. RabbitMQ: simpler, more flexible per-message routing for traditional task-queue-shaped workloads, without the log-replay capability Kafka's model provides natively.

## 10. Real-world applications

- Event-sourcing-adjacent architectures (Level 8 previews this) and analytics pipelines that need to replay historical event streams are the textbook Kafka use case — genuinely different from Project 3's more traditional task-queue-shaped notification delivery, which fits RabbitMQ's model more naturally.

## 11. Connections

Directly contrasts with Lesson 4 (RabbitMQ) as two different architectural answers to Lessons 1–3's abstract producer/consumer/delivery-semantics content. Directly echoes Module 3, Lesson 9 (replication) and Lesson 10 (partitioning/sharding) — Kafka's partition and replication model is the same underlying reasoning applied to a log instead of a relational table. Previews Level 8's event sourcing content.

## 12. Practical exercise

Without necessarily running a real cluster, work through a concrete scenario on paper: a topic with 3 partitions and a consumer group with 5 instances — determine which instances are idle and why, then work out what changes if the group instead has exactly 3 instances, and then 2.

## 13. Challenge

For a hypothetical Project 5 (Distributed System) requiring multiple independent services to each process the same stream of order events for entirely different purposes (fulfillment, analytics, fraud detection), argue for Kafka over RabbitMQ specifically, citing this lesson's independent-consumer-group replay capability as the deciding factor.

## 14. Mastery test

- Explain why Kafka guarantees ordering only within a partition, and what a producer must do to preserve ordering for a related set of messages.
- Explain the structural difference between Kafka's offset-commit model and RabbitMQ's per-message acknowledgment model.
- Explain precisely what capability Kafka's non-destructive log model provides that RabbitMQ's destructive queue model cannot offer as naturally, using the multiple-independent-consumer-groups scenario.
- Explain what a rebalance is and why it's a real, expected operational cost rather than a bug.
