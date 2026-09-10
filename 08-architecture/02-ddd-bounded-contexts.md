# Domain-Driven Design — Bounded Contexts & Aggregates

## 1. Why does this exist?

Lesson 1 ended with a real, unanswered question: how do you actually decide where a module's (or service's) boundary should go? Domain-Driven Design (DDD) is the discipline that answers this — not by an arbitrary technical split (by database table, by team headcount), but by modeling the actual business domain and letting its own natural seams determine the boundaries. This isn't academic modeling theory — it's the concrete methodology behind Module 4, Lesson 3's Spring Data JDBC aggregate content, made explicit and given its own full treatment.

## 2. Mental model

Different parts of a business genuinely think about the "same" real-world thing differently, and DDD's core insight is that this isn't a data-quality bug to fix with a single unified model — it's a fact about how organizations actually work that your software should reflect, not fight. Sales' notion of a "customer" (a lead, a deal size, a sales rep assignment) and Support's notion of a "customer" (a ticket history, an SLA tier) are legitimately different models of the same underlying person, each correct within its own context, and DDD gives you the vocabulary and discipline for keeping those models cleanly separated rather than forcing them into one bloated, everything-to-everyone "Customer" entity that satisfies no one well.

## 3. Technical explanation

**Bounded context — the actual, precise definition, worth stating exactly since "context" alone is a vague word:** a bounded context is the boundary within which a specific domain model and its vocabulary apply consistently — inside it, terms mean exactly one thing, and outside it, those same terms might mean something different, deliberately. This is the direct, formal answer to Lesson 1's "where should a module boundary go" question: a boundary belongs precisely where the business's own domain model naturally changes meaning — not where a database schema happens to have a foreign key, not where a team's current headcount happens to divide people, but where the actual business concept genuinely shifts.

**Ubiquitous language — the practical, everyday discipline that makes bounded contexts real rather than a diagram nobody consults:** within a bounded context, developers and domain experts deliberately share and consistently use exactly the same vocabulary — in conversations, in documentation, and critically, **in the code itself** (class names, method names, variable names matching the business's own terms exactly, not a developer's independently-invented technical paraphrase). This matters concretely, not just for communication clarity: when the code's vocabulary drifts from the business's actual vocabulary, translation errors between "what the business asked for" and "what the code actually does" become far more likely, and the code stops being a readable reflection of the domain it's supposed to model.

**Aggregates — DDD's answer to "what's the actual unit of consistency and transactional integrity in a system," and precisely why this matters for Module 3, Lesson 5's transaction-boundary content:** an aggregate is a cluster of related objects treated as a single unit for the purpose of data changes, with one specific member designated the **aggregate root** — every external interaction with the aggregate's internals must go through that root, which is responsible for enforcing the aggregate's own invariants (its business rules) on every change. The precise, load-bearing rule worth internalizing: **one transaction should modify exactly one aggregate** — this is a direct, deliberate design constraint, not an incidental detail, because it's what keeps Module 3, Lesson 5's ACID transaction scope aligned with your actual domain's natural consistency boundaries, rather than accidentally spanning multiple, unrelated aggregates in one transaction (a real, common source of both unnecessary lock contention, Module 3 Lesson 6, and the tangled, hard-to-reason-about code that results from one transaction trying to enforce invariants across concepts that don't actually belong together).

**Why aggregate boundaries directly determine where sagas (Module 7, Lesson 6) become necessary, rather than aggregate boundaries and saga boundaries being independent design decisions:** if "place an order" genuinely needs to modify both an `Order` aggregate and a `Payment` aggregate, and DDD's one-transaction-one-aggregate rule holds, then that operation cannot be a single ACID transaction by design — it needs exactly the saga pattern (local transaction per aggregate, compensating transactions on failure) Module 7, Lesson 6 covered, and recognizing this at the *aggregate-design* stage, rather than discovering it as an afterthought once a naive multi-aggregate transaction starts causing lock-contention or design problems, is precisely what makes DDD's aggregate discipline directly, practically useful rather than academic.

**Entities vs. value objects — a smaller but genuinely useful DDD distinction worth knowing, since it clarifies a lot of otherwise-ambiguous modeling decisions:** an **entity** has a distinct, persistent identity that matters independent of its current attribute values (a `Customer` is still "the same customer" even after their name or address changes — identity, not current attributes, defines equality). A **value object** has no independent identity — it's defined entirely by its attribute values, and two value objects with identical attributes are simply interchangeable, equal instances (a `Money` amount, an `Address` — Module 3, Lesson 1's point about a shipping address snapshot being a legitimate, non-denormalized fact tied to a specific order is precisely a value-object modeling decision, correctly recognized). This distinction directly shapes real implementation decisions (should this concept have its own database primary key and be independently queryable, or is it just a structured field embedded in its owning entity?).

## 4. How it works internally

Module 4, Lesson 3's Spring Data JDBC content directly, concretely operationalizes this lesson's aggregate concept: Spring Data JDBC deliberately loads and saves an aggregate as one coherent, atomic unit through its root, with no lazy-loading escape hatch to reach into another aggregate's internals casually — this isn't an arbitrary technical limitation of that tool, it's a direct, deliberate enforcement of DDD's aggregate discipline at the persistence-framework level, worth re-reading now with this lesson's full context behind it.

## 5. Example

```ts
// An aggregate root enforcing its own invariant — external code cannot
// bypass this by directly manipulating line items:
class Order { // aggregate root
  private lineItems: LineItem[] = [];
  private status: 'draft' | 'confirmed' = 'draft';

  addLineItem(item: LineItem) {
    if (this.status === 'confirmed') throw new Error('cannot modify a confirmed order');
    this.lineItems.push(item); // the invariant is enforced HERE, centrally
  }
}
// External code never does `order.lineItems.push(...)` directly —
// only through the root, which is precisely what "aggregate root" means.
```

## 6. Failure scenarios

- **A single transaction modifying multiple, unrelated aggregates** (e.g., updating both a customer's profile and an unrelated order's shipping status in one transaction because it happened to be convenient) — violates DDD's one-transaction-one-aggregate discipline, and is a real, common source of unnecessary lock contention (Module 3, Lesson 6) between operations that have no actual business reason to block each other.
- **A "God object" domain model** shared across every bounded context (one giant `Customer` entity trying to serve Sales, Support, and Billing simultaneously) — exactly the anti-pattern bounded contexts exist to prevent, producing a model that's bloated, has unclear ownership, and breaks in one context whenever another context's needs change it.
- **Skipping ubiquitous language discipline**, letting the code's vocabulary drift from the business's actual terms — produces a real, recurring translation tax every time a developer and a domain expert discuss the same feature using different words for the same concept.

## 7. Common misconceptions

- **"A bounded context is just a fancy name for a microservice."** A bounded context is a *modeling* boundary; whether it's implemented as a separate microservice or a module within a modular monolith (Lesson 1) is a separate, subsequent deployment decision — DDD determines *where* boundaries should be, not *how* they're deployed.
- **"Different departments having different models of 'customer' is a data-consistency bug to fix."** It's DDD's deliberate, correct modeling of a real fact about how the business actually operates — forcing one unified model onto genuinely different contexts is the actual mistake.
- **"Aggregates are just database tables with extra steps."** An aggregate is a domain-modeling concept defined by business invariants and consistency boundaries — it may or may not map to a single database table, and conflating the two conflates a domain concept with a persistence detail.

## 8. Trade-offs

DDD's discipline requires real, genuine upfront investment (working closely with actual domain experts, resisting the urge to model by convenient database shape instead of business meaning) in exchange for boundaries that align with how the business actually operates and evolves — reducing the friction of building features that cut across a poorly-drawn boundary, and giving Lesson 1's monolith-vs-microservices extraction decisions a principled basis instead of a guess.

## 9. Real-world applications

- Project 4's multi-tenant SaaS almost certainly has genuinely distinct bounded contexts (billing, permissions/access-control, the core product feature set) that shouldn't share one undifferentiated domain model — directly, immediately applicable design work.
- Every DDD-influenced codebase you'll encounter professionally uses this lesson's exact vocabulary (aggregate, aggregate root, bounded context, ubiquitous language) as working, everyday terms, not academic jargon — fluency here is a real, practical, transferable skill.

## 10. Connections

Directly extends Lesson 1 (bounded contexts are the principled answer to "where should a module/service boundary go") and Module 3, Lesson 5 (the one-transaction-one-aggregate rule directly shapes transaction scope) and Module 4, Lesson 3 (Spring Data JDBC's design is a direct operationalization of aggregates). Sets up Module 7, Lesson 6's saga content as a direct, predictable consequence of correctly-drawn aggregate boundaries.

## 11. Practical exercise

For Project 4 (or an app you've built), identify at least two bounded contexts that might currently be sharing one undifferentiated model, and sketch how each context's version of the shared concept (e.g., "user") should actually differ in the fields and behavior each context cares about.

## 12. Challenge

Design the aggregate boundaries for Project 2's ledger domain: is `Account` one aggregate, is a `Transaction` its own aggregate or part of `Account`, and where does the one-transaction-one-aggregate rule force you to use Module 7, Lesson 6's saga pattern rather than a single ACID transaction for a multi-account transfer?

## 13. Mastery test

- Define bounded context precisely enough to explain why two departments having genuinely different models of "the same" entity is correct DDD, not a bug.
- Explain the one-transaction-one-aggregate rule and why it directly determines when a saga (rather than a single transaction) becomes necessary.
- Distinguish an entity from a value object using the identity-vs-attributes criterion, with a concrete example of each from a domain you're familiar with.
