# Hexagonal & Clean Architecture — Protecting Business Logic from Infrastructure

## 1. Why does this exist?

Every lesson in this module so far has been about boundaries *between* services or *between* read and write models. This lesson is about a boundary *within* a single service or module: between your actual business logic (Lesson 2's domain model, its aggregates and invariants) and the infrastructure it happens to currently run on (which specific database, which specific HTTP framework, which specific message queue). Without a deliberate boundary here, business logic and infrastructure code tangle together in a way that makes both harder to change independently — and this is a genuinely common, avoidable problem, not an inherent cost of building real software.

## 2. Mental model

Hexagonal architecture (also called "ports and adapters") imagines your business logic as living inside a hexagon, with "ports" as the only openings connecting it to the outside world — each port is an interface describing *what* the business logic needs (a way to save an order, a way to notify a customer), never *how* that need is fulfilled. "Adapters" plug into those ports from the outside, each one a specific, concrete implementation (a Postgres adapter fulfilling the "save an order" port, an SMS-provider adapter fulfilling the "notify a customer" port). The business logic inside the hexagon never knows or cares which specific adapter is plugged in.

## 3. Technical explanation

**Ports, precisely — the interface your business logic defines and depends on, owned by the business logic, not by the infrastructure:** a port is simply an interface (in TypeScript terms, an `interface` or abstract class) that your domain/application logic declares because *it* needs that capability — critically, the port is defined **inside** your business-logic layer, expressing what the business logic requires in the business logic's own vocabulary (Lesson 2's ubiquitous language, applied here structurally), not in terms of any specific database or external system's API shape. This directional detail is the entire point and is easy to get backwards: the business logic doesn't adapt itself to fit whatever your database driver's API happens to look like — the database's adapter must instead conform to the interface the business logic has already defined on its own terms.

**Adapters, precisely — the concrete implementations plugged into ports from outside:** a **driven adapter** (also called a "secondary" or "outbound" adapter) implements a port the business logic calls *out* to (a `PostgresOrderRepository` implementing an `OrderRepository` port). A **driving adapter** (also called a "primary" or "inbound" adapter) is something that calls *into* the business logic from outside (an HTTP controller, a message-queue consumer, a CLI command — each is a different way of *invoking* the same underlying business logic, without the business logic itself needing to know or care which one triggered it).

**Why this specific direction of dependency matters — the "dependency inversion" principle underlying the whole pattern, worth stating precisely rather than treating as a stylistic preference:** in a naive design, business logic code directly imports and calls a specific ORM's classes, a specific HTTP framework's request/response objects, a specific message queue's client library — meaning changing *any* of those infrastructure choices requires touching the business logic itself, and testing the business logic requires standing up (or heavily mocking) that same infrastructure. Hexagonal architecture inverts this: the business logic depends only on interfaces it defines itself, and infrastructure code depends on (implements) those interfaces — infrastructure now depends on business logic's abstractions, not the other way around, which is precisely why it's called dependency *inversion* relative to the naive default.

**The concrete, practical payoff, worth naming specifically rather than asserting abstractly:** business logic becomes testable in complete isolation, using simple, fast, in-memory fake adapters instead of a real database or real external API — a genuinely faster and more reliable test suite than one requiring real infrastructure for every test. Swapping infrastructure (migrating from one database to another, Module 4's entire data-access-tool spectrum, replacing an SMS provider) becomes a matter of writing a new adapter conforming to an existing, unchanged port — the business logic itself never needs to be touched, reviewed, or re-tested for correctness, only the new adapter does.

**Clean Architecture — the same underlying "protect business logic from infrastructure" goal, expressed as explicit, concentric layers rather than a hexagon-and-ports metaphor:** Clean Architecture (Robert Martin's formulation) organizes code into concentric rings — **entities** (core business rules, the innermost, most stable layer — directly corresponding to Lesson 2's aggregates and domain objects), **use cases** (application-specific business rules — the specific operations your system performs, orchestrating entities), and outer rings for **interface adapters** and **frameworks/infrastructure** — with a single, strict rule: dependencies only point **inward**, never outward (an inner ring must never import or depend on anything from an outer ring). This is genuinely the same dependency-inversion principle as hexagonal architecture, expressed with more explicit layering and naming, rather than a competing or contradictory approach — the two are, in practice, close cousins solving the identical problem, and most real, mature codebases end up combining elements of both without treating them as mutually exclusive choices (Clean Architecture's layer names for internal organization, hexagonal's "port"/"adapter" vocabulary for the specific interfaces at the infrastructure boundary).

## 4. How it works internally

A NestJS service correctly applying this pattern defines a port (an abstract `OrdersRepository` interface, or an injectable token) that its business-logic service class depends on via constructor injection — NestJS's own dependency-injection system is, in fact, a natural, idiomatic fit for wiring hexagonal architecture's ports-and-adapters pattern: the concrete adapter (a `DrizzleOrdersRepository` implementing that port) is what actually gets injected at runtime, while the business logic's own code only ever references the abstract port, never the concrete Drizzle-specific implementation directly.

## 5. Example

```ts
// The PORT — owned by business logic, in business logic's own vocabulary:
interface OrdersRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}

// Business logic depends ONLY on the port, never on Drizzle/Postgres directly:
class PlaceOrderUseCase {
  constructor(private orders: OrdersRepository) {}
  async execute(orderData: OrderData) {
    const order = Order.create(orderData); // Lesson 2's aggregate, enforces invariants
    await this.orders.save(order); // calls the PORT, not a specific database
  }
}
```

## 6. Code

```ts
// The ADAPTER — a concrete, swappable implementation of the port,
// living in the infrastructure layer, depending ON the business logic's
// interface, not the reverse:
class DrizzleOrdersRepository implements OrdersRepository {
  async save(order: Order) {
    await db.insert(ordersTable).values(order.toRow()); // Drizzle specifics live HERE only
  }
  async findById(id: string) {
    const row = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    return row ? Order.fromRow(row) : null;
  }
}

// A test using a simple, fast, in-memory FAKE adapter — no real database:
class InMemoryOrdersRepository implements OrdersRepository {
  private store = new Map<string, Order>();
  async save(order: Order) { this.store.set(order.id, order); }
  async findById(id: string) { return this.store.get(id) ?? null; }
}
```

## 7. Failure scenarios

- **Business logic directly importing and calling ORM/framework-specific classes** — the naive default this lesson's whole pattern exists to prevent — makes both testing and future infrastructure changes genuinely harder, requiring the business logic itself to change whenever the infrastructure choice does.
- **A "port" defined to match the shape of a specific database's API** rather than the business logic's own actual needs — technically has an interface in place, but has inverted the dependency-direction principle backwards, defeating the pattern's real purpose even while superficially following its structure.
- **Skipping this discipline "to move faster," then facing a costly database or framework migration** where business logic and infrastructure code are so tangled that the migration requires touching and re-testing business logic that had nothing to do with the actual infrastructure change.

## 8. Common misconceptions

- **"Hexagonal and Clean Architecture are competing, incompatible approaches you must choose between."** They're close cousins solving the identical dependency-inversion problem with different vocabulary and emphasis — most mature codebases blend both without contradiction.
- **"This pattern is over-engineering for anything but a large enterprise system."** The core discipline (business logic depends on interfaces it defines, not on concrete infrastructure) scales down perfectly well to a small service, and the testing benefit alone (fast, real infrastructure-free tests) is valuable at any scale.
- **"Adding an interface in front of your database call is enough to claim you're doing hexagonal architecture."** The interface must be shaped by the business logic's own needs and vocabulary, not simply a thin pass-through wrapper matching the database API's shape one-to-one — the direction and ownership of the abstraction is the actual point, not merely its existence.

## 9. Trade-offs

Hexagonal/Clean Architecture: genuinely more testable, more infrastructure-agnostic business logic, at the cost of real upfront design discipline (defining ports thoughtfully, resisting the shortcut of calling infrastructure directly) and some additional indirection that can feel like unnecessary ceremony for a genuinely trivial, throwaway piece of code where the infrastructure will never realistically change.

## 10. Real-world applications

- Project 2's ledger business logic (the core invariants — Lesson 2's aggregate discipline) should be genuinely independent of whether it's persisted via Drizzle, jOOQ, or raw SQL (Module 4's entire tool comparison) — this lesson's pattern is what makes that independence actually achievable in code, not just an aspiration.
- Any project needing genuinely fast, reliable unit tests for its core business rules (which should be essentially every project past a certain size) benefits directly from this lesson's in-memory-fake-adapter testing pattern.

## 11. Connections

Directly depends on Lesson 2 (the business logic being protected is precisely the aggregate/domain-model content from that lesson) and Module 4's entire data-access-tool comparison (ports/adapters are exactly what makes swapping between those tools a contained, low-risk change rather than a business-logic rewrite).

## 12. Practical exercise

Take a piece of business logic you've written that currently calls a specific ORM or database client directly, refactor it to depend on a port (an interface) instead, implement both a real adapter and an in-memory fake adapter, and write a fast unit test against the fake — confirming the business logic's correctness is verifiable with zero real database involved.

## 13. Challenge

Design the ports (interfaces) Project 2's core ledger business logic needs — for persistence, for notifying external systems (payment providers), and for publishing domain events (Lesson 3) — and specify what each port's method signatures should look like, expressed entirely in the ledger domain's own vocabulary, not in terms of any specific technology's API shape.

## 14. Mastery test

- Explain the dependency-inversion principle underlying hexagonal architecture precisely enough to state, given a code snippet, whether it correctly follows the pattern or has the dependency direction backwards.
- Distinguish a driving adapter from a driven adapter with a concrete example of each.
- Explain the concrete testing benefit this pattern provides, and why an in-memory fake adapter is a legitimate, not merely convenient, testing tool under this architecture.
