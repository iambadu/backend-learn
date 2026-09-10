# Backend Engineering University

A self-paced, concept-first curriculum for going from "I can build an API" to "I understand how backend systems work and can design reliable, scalable systems from first principles."

This is **Phase 1** of the system: the architecture. No lessons exist yet. Read `ROADMAP.md`, then say **`BUILD THE CURRICULUM`** to start generating Module 1 (Networking).

---

## How this works

This isn't a textbook you read passively. It's a tutor relationship with modes:

| You say | What happens |
|---|---|
| `Start` | Begin the next lesson in sequence |
| `Quiz me` | Socratic mode — one question at a time, no answers handed over, hints before explanations |
| `Practice` | An implementation exercise for the current topic |
| `Debug` | Broken code/architecture to diagnose |
| `Design` | A system-design scenario to defend |
| `Review` | Weak-spot analysis + targeted exercises, pulled from `PROGRESS.md` |
| `Exam` | Full test of a completed module |
| `I don't understand` | Re-explanation using a **different** mental model, not a repeat |
| `Teach` | You explain a concept back — this is the mastery-6 checkpoint |

**Rule for the tutor (me):** never hand over a solution, quiz answer, or architecture diagram before you've attempted it. Struggle is the point. Explanations come after an attempt, hints, and a second attempt — not before.

---

## Ground rules this curriculum follows

1. **Fundamentals before frameworks.** Every technology (Redis, Kafka, NestJS, jOOQ, Drizzle...) is introduced only after the underlying problem it solves has been taught without it.
2. **Concepts, not framework chapters.** Modules are organized by idea (caching, consistency, isolation levels), not by product.
3. **Attempt before explanation.** Problem → your attempt → gap identified → hint → explanation.
4. **Active recall, always.** Every lesson ends in recall/scenario/design/mastery questions, not just prose.
5. **Everything connects.** Each lesson states what it depends on and what depends on it (see the dependency graph in `ROADMAP.md`).
6. **No stack-hopping.** If you ask "should I learn Go/Rust/Kafka/Kubernetes right now," the default answer is "not yet, here's why" unless it's actually load-bearing for the current objective. This is deliberate — see `ROADMAP.md` → Anti-Procrastination Policy.
7. **Measure, don't guess.** Performance claims get challenged until backed by a benchmark or a stated bottleneck theory.

---

## Your stack (default, not exclusive)

- **Primary:** TypeScript + NestJS + PostgreSQL + Drizzle — because you already know TypeScript, and this keeps you close to SQL rather than hidden behind heavy ORM magic.
- **Secondary (introduced at Level 4 / Level 9):** Java + Spring Boot — for architectural breadth (DI, Spring MVC, Spring Security, Spring Data JDBC, jOOQ), not as a replacement.
- **Databases:** PostgreSQL is the workhorse throughout. Redis for caching/queues once Level 5–6 justifies it.

Framework choices are revisited explicitly in Level 4 (Data Access) as a trade-off comparison, not a popularity contest.

---

## Directory structure

```
backend-learn/
├── README.md              ← you are here
├── ROADMAP.md              ← full curriculum architecture, dependency graph, projects, books
├── PROGRESS.md             ← mastery tracker, spaced-review queue, misconception log
│
├── 01-networking/
├── 02-backend-fundamentals/
├── 03-databases/
├── 04-data-access/
├── 05-caching/
├── 06-messaging/
├── 07-distributed-systems/
├── 08-architecture/
├── 09-infrastructure/
├── 10-reliability/
├── 11-security/
├── 12-performance/
├── 13-system-design/
│
├── projects/                ← the 5 progressively harder builds + final project
├── exercises/                ← standalone practice problems, indexed by module
├── exams/                    ← module and cumulative mastery exams
└── reference/                ← book notes, cheat sheets, glossary
```

Each numbered module directory will contain one file per lesson (`01-tcp-ip.md`, `02-http.md`, ...) generated in Phase 2, following the 15-section lesson template defined in `ROADMAP.md`.

## Status

**Phase 1 complete:** curriculum architecture designed (see `ROADMAP.md`).
**Phase 2 complete:** all 13 modules built — 70 lessons across Modules 1–12, plus Module 13's system-design framework and 12-scenario bank, and a cumulative exam per module in `exams/`. Every lesson is research-grounded (RFCs, named algorithms, current benchmarks — not simplified summaries) per an explicit depth standard set mid-build; see `PROGRESS.md` for the full per-module topic index.
**Phase 3 (interactive tutor):** begins now. Say `Start` to begin Module 1, or name any module/topic directly — nothing has been worked through yet, so `PROGRESS.md` shows every module as built-but-unstarted.

See `PROGRESS.md` for the live mastery tracker.
