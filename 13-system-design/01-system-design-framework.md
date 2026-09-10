# The System Design Framework — How This Level Actually Runs

## 1. Why this level is different from every module before it

Levels 1–12 taught you mechanisms — concepts, each with a precise definition, a failure mode, and a trade-off. This level teaches nothing new. Its entire purpose is **synthesis under adversarial pressure**: given a vague, real-world-shaped prompt ("design a notification platform"), can you produce a defensible design and hold it up against the exact attack questions from `README.md` — 10x traffic, DB down, duplicate request, message delivered twice, worker crash, external API timeout, network partition, data inconsistency — using the vocabulary and mechanisms from Levels 1–12 by name, correctly?

This is why this level has almost no lesson content and instead runs in **System Design Mode**: you propose a design, the tutor attacks it, you defend or revise. The two files in this directory exist to structure that process, not to teach it — `02-scenario-bank.md` is the prompt list, and this file is the method for working through any of them.

## 2. The four-step method (the Alex Xu framework, used deliberately — not a substitute for the attack process, a scaffold for it)

1. **Clarify requirements.** Before designing anything, pin down: functional requirements (what must the system actually do — be explicit and narrow; "design a notification platform" is not a spec), non-functional requirements (Module 10, Lesson 2's SLI/SLO vocabulary — what latency, what availability, what consistency model per Module 7, Lesson 2), and scale (Module 12's capacity-planning questions — how many users, how many requests/second, what's the read/write ratio). Skipping this step is the single most common cause of a design that answers the wrong question well.
2. **Propose a high-level design.** Sketch the major components and how data flows between them — API layer (Module 2), data stores (Module 3), caching (Module 5), messaging (Module 6), and how they're arranged (Module 8's architecture content: monolith vs. services, sync vs. event-driven). Don't over-specify yet — this is the skeleton, not the final answer.
3. **Deep dive.** Pick the two or three components where the real design difficulty actually lives (almost never all of them equally) and go deep: the exact schema and its normalization/denormalization decisions (Module 3, Lesson 1), the exact consistency model per data type (Module 7, Lesson 2), the exact idempotency strategy (Module 2, Lesson 8), the exact failure-handling approach (Module 7, Lesson 8). This is where Levels 1–12's depth actually pays off — a shallow deep-dive here is the second most common failure mode after skipping requirements.
4. **Address bottlenecks and trade-offs.** This is where the attack questions land. For each: what breaks, why, and what you'd do about it — not "it would probably be fine," a specific, mechanism-grounded answer.

## 3. The attack question set (from `README.md`, restated here as the actual working checklist for this level)

- What happens when traffic increases 100×? (Module 3, Lesson 10's partitioning/sharding; Module 9's infrastructure scaling; Module 12's capacity planning)
- What happens if the database goes down? (Module 3, Lesson 9's replication/failover; Module 7, Lesson 1's CAP trade-off)
- What happens if a request is duplicated? (Module 2, Lesson 8's idempotency keys)
- What happens if a message is delivered twice? (Module 6, Lesson 3's delivery semantics and idempotent consumers)
- What happens if a worker crashes? (Module 6, Lesson 2's retries/DLQ; Module 7, Lesson 4's failure detection)
- What happens if an external API times out? (Module 7, Lesson 8's timeouts/circuit breakers)
- What happens if the network partitions? (Module 7, Lesson 1's CAP theorem, precisely — not the folklore version)
- What happens if data becomes inconsistent? (Module 7, Lesson 2's consistency models; Module 8, Lesson 3's event sourcing if applicable)
- Where is the bottleneck? (Module 12's profiling/load-testing discipline — an answer grounded in what you'd actually measure, not a guess)
- What is the consistency requirement, per data type, not for the system as a whole? (Module 7, Lesson 2 — different data in the same system legitimately needs different consistency)
- What should be cached, and what specifically would go wrong if it were stale? (Module 5, Lesson 1's caching-candidate criteria)
- What should be asynchronous, and what does the caller's response actually promise if it is? (Module 6, Lesson 1)
- What should be transactional, and what's the aggregate boundary? (Module 3, Lesson 5; Module 8, Lesson 2's DDD content)
- What should be observable, and what would actually page someone versus just show on a dashboard? (Module 10, Lessons 1 and 3)

## 4. What "good" looks like at this level

Not a design with zero weaknesses — every real design has trade-offs. Good means: every weakness is *named*, its consequence is *specific* (not "it might be slow," but "under a partition, this specific write can be lost because we chose asynchronous replication here"), and the choice was *deliberate* (you'd make the same choice again knowing the trade-off, or you'd change it and can say exactly what you'd change and why). This is the actual bar Levels 1–12 were building toward — not encyclopedic recall, but the judgment to apply the right piece of it, under pressure, to a problem you haven't seen phrased exactly this way before.

## 5. How to use this level

Say `System design` (per `README.md`'s mode list) to get a scenario — either one from `02-scenario-bank.md` or a novel one — and work through the four-step method above out loud. Don't wait to be asked the attack questions; raising them yourself, unprompted, before the tutor does, is a stronger signal of mastery-6 (Design, per `ROADMAP.md`'s mastery scale) than only answering when pressed. The Final Project (an African-market SaaS/fintech platform, per `ROADMAP.md`) is this level's capstone artifact — everything else here is practice for defending that design when it's your turn to propose it with no scaffold at all.
