# Module Exam — 08: Architecture

Cumulative test across Lessons 1–5. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. Explain precisely what microservices scale, and what they don't automatically improve, correcting the roadmap's flagged misconception.
2. Define bounded context and explain why two departments having different models of "the same" entity is correct DDD.
3. State the one-transaction-one-aggregate rule and its consequence for when sagas become necessary.
4. Distinguish event-driven architecture, CQRS, and event sourcing as three separable decisions.
5. Explain the dependency-inversion principle behind hexagonal/clean architecture.
6. Distinguish an API gateway from a BFF by what each is scoped to handle.

## Section B — Explain in your own words

7. Explain how a modular monolith gets most of microservices' organizational benefit without its network cost.
8. Explain why event sourcing's "derive state by replay" mechanism directly parallels Module 3's WAL and MVCC content.
9. Explain the concrete testing benefit hexagonal architecture provides via in-memory fake adapters.

## Section C — Scenario diagnosis

10. A team splits into microservices for a 4-person startup's MVP, citing "we'll need to scale eventually." Six months later, feature velocity has dropped and cross-service data consistency bugs are common. Diagnose using Lesson 1's criteria.
11. A CQRS-based dashboard shows a user's order as "pending" for several seconds after they placed it, even though the write succeeded immediately. Diagnose.
12. An API gateway's timeout to a slow notification service is causing unrelated requests to unrelated backend services to also fail. Diagnose using Module 7, Lesson 8's content.

## Section D — Trade-off reasoning

13. Argue for or against event sourcing for Project 2's ledger, using Lesson 3's specific guidance rather than "it sounds appropriate for finance."
14. Defend a specific choice (modular monolith vs. microservices, with justification per module if hybrid) for Project 4.
15. Argue for adding a BFF layer (or against it) for a described two-client-type system (given in conversation).

## Section E — System design

16. Design Project 4's complete architecture: monolith/modular-monolith/microservices decision (with justification per Lesson 1's criteria), bounded contexts (Lesson 2), whether CQRS/event sourcing applies to any specific subsystem (Lesson 3), how business logic is protected from infrastructure (Lesson 4), and the gateway/BFF topology (Lesson 5) — justified against this module's content throughout.

---

**On passing:** update `PROGRESS.md` — Module 8 complete, log mastery levels. Module 9 (Infrastructure) unlocks next.
