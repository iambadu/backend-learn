# Consensus — How Distributed Nodes Agree on One Truth

## 1. Why does this exist?

Lesson 2's linearizability and quorum-based consistency both quietly assumed something this lesson makes explicit: that a set of independent nodes can actually **agree** on a single, ordered sequence of operations, even though any of them might crash or become unreachable at any moment. Consensus algorithms are the specific, formally-proven mechanisms that make that agreement possible — and Raft, specifically, is worth learning in real depth because it's deliberately designed to be understandable (its explicit design goal, stated by its own authors, was being easier to reason about than the older Paxos algorithm) while providing the same fundamental guarantee.

## 2. Mental model

Consensus is how a group of people who can't always hear each other clearly still manage to agree on a single, shared decision, and on the exact order a sequence of decisions was made in — even if some of them are asleep (crashed), momentarily out of earshot (network-partitioned), or lying (a concern Raft doesn't handle — it assumes non-Byzantine, i.e., non-malicious, failures; Byzantine fault tolerance is a separate, harder problem class).

## 3. Technical explanation

**Raft's three sub-problems, deliberately separated for understandability — worth knowing this separation exists, since it's Raft's actual design contribution over Paxos, not just "a simpler algorithm":** Raft explicitly decomposes consensus into **leader election** (choosing which node coordinates), **log replication** (getting all nodes to agree on a sequence of entries), and **safety** (ensuring the algorithm never produces an incorrect result even under adversarial timing/failure combinations) — Paxos solves the same underlying problem but without this same explicit decomposition, which is precisely why it has a well-documented reputation for being harder to correctly implement despite being formally equivalent in what it guarantees.

**Leader election, precisely:** every node starts as a **follower**. Each follower runs an **election timeout** — a randomized duration (the randomization is deliberate and load-bearing: it prevents every follower from simultaneously deciding "no leader" and starting an election at the exact same moment, directly echoing Module 6, Lesson 2's jitter content in a different context) — and if it hears nothing from a leader before that timeout expires, it becomes a **candidate**, increments a **term** number (a logical clock, Lesson 7, that increases monotonically and lets nodes detect and reject messages from stale, outdated leaders), and requests votes from every other node. A candidate that receives votes from a **majority** of nodes becomes the leader for that term. If the leader subsequently fails (its heartbeats stop arriving), followers' election timeouts expire again and the process repeats with a new, higher term.

**Why a majority, specifically — the mechanism that makes Raft correct even under real, partial failures:** requiring a majority (not unanimity) means the system can keep making progress even if a minority of nodes are down or unreachable — and, critically, it guarantees that **at most one leader can be elected per term**, because two disjoint majorities of the same node set cannot both exist simultaneously (any two majorities of a set must overlap by at least one node, and that overlapping node can only vote once per term) — this single fact is the mathematical core of why Raft prevents split-brain (two nodes simultaneously believing they're the legitimate leader).

**Log replication, precisely — how the leader gets every follower to agree on the same sequence of operations:** once elected, the leader accepts client requests, appends each as an entry to its own local log, and sends that entry to every follower. Once a **majority** of nodes (leader included) have durably stored the entry, the leader considers it **committed** and applies it to its own state machine, notifying followers to do the same on their next contact. This is precisely the mechanism Module 3, Lesson 9's Postgres WAL-streaming replication and Module 6, Lesson 5's Kafka partition-replication both echo structurally (a leader-driven, majority-acknowledged, ordered log) — Raft's actual contribution is formalizing and proving this pattern correct under the full range of possible failure and timing scenarios, not inventing the leader-plus-replicated-log idea itself, which recurs across this entire curriculum in different concrete guises.

**Safety — the guarantee that makes this all trustworthy, worth naming even briefly rather than treating leader election and log replication as sufficient on their own:** Raft's safety property ensures that if any node has applied a given log entry at a given position to its state machine, no other node will ever apply a *different* entry at that same position — even accounting for leader crashes mid-replication, network partitions, and old, stale leaders that haven't yet realized a new election happened. This is achieved through specific rules (a candidate can only win an election if its log is at least as up-to-date as a majority of voters', preventing a node with stale, incomplete data from becoming leader and overwriting already-committed entries) that are exactly the kind of subtle correctness detail that makes hand-rolling a consensus algorithm from scratch a genuinely bad idea for a production system — this is precisely why Lesson 5 will insist on using a battle-tested implementation (etcd, ZooKeeper) rather than reinventing this logic.

**Paxos, briefly, since it's worth recognizing by name even without the same depth of treatment:** Paxos solves the identical underlying problem (majority-based agreement, tolerant of node failures) but through a less explicitly-decomposed protocol (proposers, acceptors, and learners, with multiple rounds of proposal numbers) that's formally equivalent in guarantee but has a well-documented reputation for being significantly harder to correctly reason about and implement — which is the entire, explicit motivation behind Raft's existence as an alternative.

## 4. How it works internally

`etcd` (the distributed key-value store underlying Kubernetes' own cluster state, and CockroachDB's replication layer) uses Raft directly and literally — every write to etcd goes through exactly this leader-election-plus-majority-committed-log-replication process, meaning every Kubernetes cluster you'll ever operate (Level 9) is, underneath, continuously running the algorithm this lesson describes, for its own core coordination state.

## 5. Example

```
5-node Raft cluster, term 7:
Node A (leader) appends entry X to its log, sends to B, C, D, E.
B and C acknowledge (majority: A + B + C = 3 of 5) → entry X committed.
D and E haven't responded yet — doesn't matter, majority already reached.
```

## 6. Code

```
# Conceptual state machine per node, not literal code:
state = FOLLOWER
on election_timeout_expires:
  state = CANDIDATE
  term += 1
  request_votes_from_all_peers()
on receiving_majority_votes:
  state = LEADER
on receiving_heartbeat_from_higher_term_leader:
  state = FOLLOWER  # step down — a more current leader exists
```

## 7. Failure scenarios

- **A network partition splitting a 5-node cluster into a 3-node and a 2-node group** — only the 3-node group can elect a leader (it has a majority), and the 2-node group correctly remains leaderless, unable to make progress, until the partition heals — this is Raft correctly choosing consistency over availability for the minority side, a direct, concrete instance of Lesson 1's CAP content.
- **A stale leader that was partitioned away resuming contact after the partition heals**, having missed an intervening election — its outdated term number causes it to immediately recognize a newer leader's higher term and step down, exactly the mechanism preventing split-brain.
- **Hand-rolling a "simplified" consensus algorithm** for a production system, skipping some of Raft's subtler safety rules for expediency — a real, well-documented source of correctness bugs that only surface under specific, rare failure-timing combinations, precisely why using a proven implementation (Lesson 5) is the standard, correct engineering choice.

## 8. Common misconceptions

- **"Consensus just means 'most nodes agree.'"** It specifically means agreeing on both *what* happened and the *exact order* it happened in, durably, even across leader failures and partitions — a much stronger, more precisely defined guarantee than casual majority agreement.
- **"Raft and Paxos guarantee different things."** They're formally equivalent in the guarantee provided — Raft's actual distinction is being more explicitly decomposed and easier to correctly implement, not a different or stronger correctness property.
- **"A 5-node cluster can tolerate 4 node failures."** It can tolerate `floor((N-1)/2)` failures while still maintaining a majority — for 5 nodes, that's 2, not 4; losing 3 of 5 leaves no possible majority among the survivors.

## 9. Trade-offs

Consensus protocols: strong, formally-proven correctness guarantees even under partial failure, at real cost — every committed write requires a majority round trip (Lesson 1's PACELC latency cost, concretely), and the system deliberately sacrifices availability on a minority partition (Lesson 1's CAP partition branch, concretely) rather than risk an incorrect, divergent result.

## 10. Real-world applications

- etcd (Kubernetes' cluster state store), ZooKeeper (an older, Paxos-lineage-adjacent coordination service still widely used), and CockroachDB's replication layer all use consensus protocols directly and literally, not as an abstract concept — this lesson's content is the actual mechanism underlying infrastructure you'll operate in Level 9.

## 11. Connections

Directly depends on Lesson 1 (CAP — a consensus cluster's minority-partition unavailability is a direct, concrete CAP instance) and Lesson 7 (term numbers are a logical clock, precisely). Sets up Lesson 4 (leader election and failure detection, generalized beyond Raft's specific mechanism) and Lesson 5 (why you should use a proven consensus-backed lock service rather than hand-rolling distributed locking).

## 12. Practical exercise

Trace through, on paper, a 5-node Raft cluster's behavior across a specific sequence of events (a leader elected, two entries committed, the leader crashing mid-replication of a third entry, a new election): determine, for each step, which nodes have which entries, which entries are committed, and who becomes the new leader.

## 13. Challenge

For Project 5 (Distributed System), identify which piece of your system's coordination state (if any) genuinely requires consensus-backed correctness (a leader-election-dependent job scheduler, a configuration store multiple services must agree on) versus which can tolerate a weaker consistency model from Lesson 2, and justify using an existing consensus implementation (etcd) rather than building anything from scratch.

## 14. Mastery test

- Explain why a majority (not unanimity) is sufficient for Raft's correctness, and what mathematical property of majorities makes split-brain impossible as a result.
- Trace through what happens to a 5-node Raft cluster split into a 3-node and 2-node partition, and explain why this is a deliberate correctness choice, not a bug.
- Explain Raft's three-part decomposition (leader election, log replication, safety) and why this decomposition was Raft's actual design contribution over Paxos.
- Compute how many simultaneous node failures a 7-node Raft cluster can tolerate while remaining available.
