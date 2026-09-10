# Monoliths, Modular Monoliths & Microservices — Trade-Off Analysis, Not a Hierarchy

## 1. Why does this exist?

The roadmap's flagged misconception — "microservices scale better" — is the single most consequential piece of folklore this curriculum needs to correct, because it shapes real, expensive, hard-to-reverse architectural decisions made by teams who've absorbed the folklore without the underlying trade-off analysis. This lesson exists to replace "microservices are the modern, correct choice" with a precise accounting of what each architectural style actually costs and buys, so the choice becomes deliberate rather than inherited from blog-post consensus.

## 2. Mental model

A monolith is one large workshop where every craftsperson shares the same tools, the same floor space, and can walk over and hand a colleague something directly. Microservices are separate workshops in separate buildings, each with its own tools and staff, communicating by courier — genuinely more resilient to one workshop catching fire, genuinely more able to let each workshop specialize and staff independently, and genuinely slower and more error-prone for anything that needs several workshops' coordinated output at once.

## 3. Technical explanation

**What "microservices scale better" gets right, and precisely what it leaves out — the corrective, not a dismissal:** microservices scale **teams** — independent services can be built, deployed, and owned by independent teams without needing to coordinate a shared release, shared codebase conventions, or a shared deploy schedule (directly connecting to Module 1, Lesson 8's load-balancer content — independently scalable services genuinely can scale their own compute independently, unlike a monolith where scaling means replicating the whole application even if only one part of it is actually under load). What it does **not** automatically do is make the *system* faster, simpler, or more reliable — and it introduces real, unavoidable costs that a monolith structurally doesn't have: every cross-service call is now a network call (Module 1's full latency stack — DNS, TCP, TLS — applies to what used to be a simple in-process function call), cross-service data consistency requires Module 7, Lesson 6's saga machinery instead of a single ACID transaction (Module 3, Lesson 5), and debugging a request that spans five services requires distributed tracing (Level 10) instead of a single stack trace.

**The monolith's genuine, real advantages — worth stating as directly as microservices' advantages, since the folklore rarely does:** a single codebase enables ACID transactions (Module 3, Lesson 5) across everything the application touches, with none of Module 7, Lesson 6's saga complexity; refactoring across module boundaries is a local, compiler-checked code change, not a coordinated, multi-team, multi-deploy migration; testing is dramatically simpler (Module 3's database and the application logic under test live in one process, not several); and there is no network between components that used to be a function call, meaning none of Module 1's latency stack applies to internal calls at all.

**Modular monoliths — the deliberate middle ground, and why current, sober industry guidance increasingly recommends it as the default starting point rather than either extreme:** a modular monolith is architected with genuine, enforced internal boundaries — distinct modules with well-defined interfaces between them, each module's internal data and logic hidden from the others (directly previewing Lesson 2's bounded-context concept, applied within a single deployable rather than across separate services) — while remaining **one codebase, one deployment**. This gets you most of microservices' organizational benefit (clear ownership, enforced boundaries preventing the "everything touches everything" tangle that gives monoliths their bad reputation) without paying the network-call, distributed-transaction, and distributed-debugging costs, because the module boundaries are enforced at the code/compiler level, not the network level. The current, sober industry position (worth taking seriously over either extreme's advocates): **start with a modular monolith**, establish real internal boundaries, and extract a specific module into its own service later, deliberately, only once a genuine, specific, evidenced need (an independent scaling requirement, a need for a separate team to own and deploy independently) actually justifies the network-boundary cost — not preemptively, on the assumption that "we'll need it eventually."

**The actual, correct decision criteria — stated as questions, because "which is better" has no universal answer, only "better for what, given what constraints":**
- **Team size and structure**: do you actually have multiple teams that would benefit from independent deploy schedules and ownership boundaries? A small team gains little from microservices' team-autonomy benefit while paying its full complexity cost.
- **Independent scaling need**: does one specific part of the system have genuinely different, independent load characteristics from the rest (a video-transcoding module needing far more compute than the rest of an app)? This is a real, legitimate microservices justification — but it applies to *that specific module*, not a blanket "split everything" decision.
- **Blast radius tolerance**: can you tolerate one component's failure taking down the whole system (a monolith's shared-fate risk) or does isolating failures matter enough to justify Level 7's full distributed-systems cost?
- **Data consistency requirements**: does the system's core logic need genuine ACID transactions across what would become multiple services' data (Project 2's ledger is the clearest example in this curriculum of data that strongly prefers staying inside one transactional boundary, resisting premature splitting)?

## 4. How it works internally

A well-built modular monolith enforces its module boundaries the same way any good software design enforces encapsulation — a module's internal database tables or ORM entities aren't directly accessible from another module's code; all cross-module interaction goes through an explicit, narrow interface (a well-defined function or class boundary) — the discipline is identical in kind to what a microservices architecture enforces via the network, just enforced by code review and compiler/linter tooling instead of a literal process boundary, which is exactly why extracting a well-bounded module into a real service later is comparatively low-risk: the boundary was already correctly drawn, you're just changing *how* it's enforced, not redesigning the boundary itself.

## 5. Example

A modular monolith's directory structure directly reflecting enforced module boundaries:
```
src/
  billing/        (internal to billing only: its own DB tables, services)
  inventory/      (internal to inventory only)
  shared/         (genuinely shared, cross-cutting concerns only)
# billing/ code should be structurally unable to import inventory/'s internals directly —
# only through inventory/'s explicit, public interface.
```

## 6. Code

```ts
// A modular monolith's cross-module interaction, through an explicit
// interface — NOT direct access to another module's internal repository:
// billing/billing.service.ts
export class BillingService {
  constructor(private inventory: InventoryPublicApi) {} // explicit dependency

  async chargeForOrder(order: Order) {
    const available = await this.inventory.checkAvailability(order.items); // explicit call
    if (!available) throw new Error('insufficient stock');
    // ... charge logic, same process, same transaction if needed
  }
}
```

## 7. Failure scenarios

- **Splitting into microservices prematurely**, before real team-scaling or independent-scaling needs exist — paying Level 7's full distributed-systems complexity tax for organizational benefits nobody yet needs, a real, common, expensive mistake.
- **A monolith with no real internal boundaries** ("the big ball of mud," where every module freely accesses every other module's internals) — this is what gives monoliths their bad reputation, and it's a discipline failure, not an inherent property of the monolithic deployment model; a modular monolith with genuinely enforced boundaries doesn't have this problem.
- **Extracting a poorly-bounded module into a service**, discovering only afterward that it needed frequent, transactionally-consistent interaction with data that's now on the other side of a network boundary — a real, expensive mistake that Lesson 2's bounded-context discipline, applied *before* extraction, specifically prevents.

## 8. Common misconceptions

- **"Microservices scale better."** The roadmap's own flagged misconception — they scale teams and enable independent component scaling; they do not inherently make a system faster, simpler, or more reliable, and they introduce real, unavoidable distributed-systems costs a monolith doesn't have.
- **"A monolith can't be well-organized."** A modular monolith with genuinely enforced internal boundaries is a real, legitimate, increasingly-recommended architecture, not a euphemism for an unorganized codebase.
- **"You should design for microservices from day one, since you'll need to scale eventually."** Current, sober industry guidance increasingly recommends the opposite — start modular-monolith, extract deliberately and only when a specific, evidenced need justifies the network-boundary cost.

## 9. Trade-offs

Monolith: simplest, fastest to build and reason about, ACID transactions everywhere, shared-fate failure risk, poor team-independence at scale. Microservices: genuine team and independent-scaling benefits, real network/consistency/debugging cost, justified primarily by organizational (team) needs more often than purely technical ones. Modular monolith: most of microservices' organizational benefit without the network cost, until a specific module's needs genuinely justify extraction.

## 10. Real-world applications

- Project 4 (Multi-Tenant SaaS) is exactly the kind of system where this lesson's decision framework should be applied explicitly at the design stage, not assumed — you'll need to justify your choice, not default to either extreme.
- Well-known, real production examples of successful modular monoliths (Shopify's core platform, for a long period of its scale, being a widely-cited real case) directly counter the "you must eventually go microservices to scale" folklore this lesson corrects.

## 11. Connections

Directly resolves the roadmap's flagged misconception with a full, precise trade-off analysis. Sets up Lesson 2 (DDD's bounded contexts are the discipline for drawing module boundaries correctly, whether they stay inside one monolith or become separate services) and connects to Level 7's entire distributed-systems content as the real cost microservices incur that this lesson names but doesn't re-derive.

## 12. Practical exercise

For an application you've built or are building, sketch its module boundaries as if designing a modular monolith (even if it's currently a single undifferentiated codebase) — identify what's genuinely internal to each module versus what needs an explicit cross-module interface, and note which modules, if any, would have a real, specific justification for extraction into a separate service under this lesson's criteria.

## 13. Challenge

For Project 4, decide explicitly: modular monolith or microservices, for which specific modules (if a hybrid), and justify every "extract this into a service" decision against this lesson's specific criteria (team structure, independent scaling need, blast radius, data consistency requirements) — not general preference or trend.

## 14. Mastery test

- Explain precisely what microservices scale, and what they don't automatically improve, correcting the roadmap's flagged misconception with specifics.
- Explain how a modular monolith gets most of microservices' organizational benefit without its network cost, and what discipline makes that possible.
- Given a described system and team (in conversation), apply this lesson's four decision criteria to recommend and defend an architecture.
