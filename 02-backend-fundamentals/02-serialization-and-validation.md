# Serialization & Validation — Trusting Nothing That Crosses a Process Boundary

## 1. Why does this exist?

The moment data crosses a network boundary (Module 1), it stops being a typed in-memory object and becomes bytes that *some other process* — one you don't control, running code you didn't write, possibly malicious — produced. TypeScript's compile-time types are erased at runtime and provide zero protection against this; they describe what your code *expects*, not what actually arrived. Serialization is how structured data becomes bytes (and back); validation is the discipline of never trusting that the bytes you received actually match the shape you expect, before you act on them.

## 2. Mental model

Think of your API boundary as a customs checkpoint, not a formality. TypeScript's type system is the paperwork your own government issues — it says nothing about what a foreign traveler is actually carrying. Validation is the physical inspection that happens regardless of what the paperwork claims, every single time, at the border — not once, not "probably fine because the frontend already checks this."

## 3. Simple explanation

**Serialization** converts an in-memory structure into a transmittable format (most commonly JSON for HTTP APIs) and **deserialization** reverses it. **Validation** is a separate, subsequent step: given successfully deserialized data (which only proves it was syntactically valid JSON, nothing about its *shape* or *semantics*), confirm it actually matches the structure and constraints your handler requires — right types, required fields present, values within acceptable ranges — before your business logic touches it.

## 4. Technical explanation

**Why "the frontend validates this" is not validation, ever:** a frontend form's validation is a UX convenience for a well-behaved client, not a security or correctness boundary — anyone can call your API directly with `curl`, a modified client, or a malicious script, bypassing every client-side check entirely. Server-side validation at the API boundary is the *only* validation that actually constrains what your business logic and database ever see. This isn't a stylistic preference; it's the literal difference between an API surface that's safe under adversarial input and one that isn't.

**Runtime validation in a TypeScript backend, and why TypeScript's own types don't help here:** TypeScript's type annotations are compile-time-only and erased entirely by the time your code runs — a `function createUser(body: CreateUserDto)` gives you *zero* runtime guarantee that `body` actually has that shape; it's purely a development-time contract between you and the compiler, not an enforced boundary. This is exactly the gap runtime validation libraries close:
- **`class-validator` (NestJS's default pairing with `class-transformer`)**: decorator-based, validates against a class whose shape mirrors your DTO — `@IsString()`, `@IsEmail()`, `@Min(0)` — integrates tightly with NestJS's dependency-injection and pipe system, so validation can run automatically before a handler is invoked.
- **Zod**: a schema-first (not decorator-first) TypeScript library that defines the runtime schema *and* derives the static TypeScript type from it (`z.infer<typeof schema>`) — meaning your compile-time type and your runtime validation are structurally guaranteed to never drift apart, a real advantage over hand-maintaining a class/interface separately from its validation rules. This "schema is the single source of truth for both runtime and compile-time shape" approach is increasingly the default recommendation for new TypeScript backends specifically because of that drift risk in decorator-based approaches.
- **JSON Schema**: a language-agnostic (not TypeScript-specific) schema format, useful when the same validation contract needs to be shared across services written in different languages, or when you want your API's request/response shapes formally documented (OpenAPI specs embed JSON Schema directly) independent of any specific runtime's type system.

**Serialization format trade-offs — this is a real architectural decision, not a formality:**
- **JSON**: human-readable, universally supported, but verbose (field names repeated in every object) and untyped at the wire level (a client must infer or be told out-of-band whether a field is a number vs. a numeric string).
- **Protocol Buffers (protobuf) / gRPC**: binary, schema-defined (a `.proto` file is the contract, and both client and server generate typed code from it), significantly smaller on the wire (no repeated field names, compact binary encoding of numbers) and faster to (de)serialize — the trade-off is losing human-readability (you can't just `curl` and eyeball a response) and requiring schema distribution/versioning discipline between client and server ahead of time, rather than JSON's "just parse whatever comes back" flexibility.
- **Practical rule of thumb**: public-facing REST APIs default to JSON because of universal client support and debuggability; internal, high-volume service-to-service calls (Level 8's microservices) more often reach for protobuf/gRPC specifically because the bandwidth and (de)serialization CPU savings compound at scale in a way that matters for internal traffic but rarely matters for a comparatively low-volume public API.

**Content negotiation — letting a single endpoint serve multiple representations correctly:** the `Accept` request header lets a client state its preferred response format(s), optionally weighted (`Accept: application/json, application/xml;q=0.9` — the `q` value expressing relative preference), and the server picks the best mutually-supported match and reflects its choice in the response's `Content-Type` header. This is the standardized mechanism (not a bespoke convention) behind an endpoint serving JSON to one client and protobuf to a bandwidth-conscious mobile client without needing separate URLs for each — directly connects to Module 1 Lesson 5's point that `Content-Type` is what tells a receiver how to parse a body, applied here from the request side (`Accept`) rather than the response side.

## 5. How it works internally

A NestJS request pipeline runs, in order: the raw body arrives as bytes (Module 1's TCP byte stream) → the framework's body parser deserializes it based on `Content-Type` (usually `JSON.parse` under the hood for `application/json`) → a validation pipe (backed by `class-validator`/Zod) checks the deserialized object against your DTO's rules, throwing a `400`-class error immediately if it fails → only *then* does your controller method's body execute, now with a genuinely trustworthy, typed argument. Skipping or misconfiguring the validation-pipe step is the single most common way "TypeScript types" get mistaken for a runtime guarantee they never provided.

## 6. Example

```
curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d '{"age": "not-a-number"}'
```
If the API's validation is correctly wired, this returns a `400` with a clear validation error (ideally shaped per Lesson 1's RFC 9457 format) — never a `500` from your business logic choking on an unexpected type three layers deep, and never, worse, silent acceptance of malformed data into your database.

## 7. Code

```ts
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
});

type CreateUserDto = z.infer<typeof CreateUserSchema>; // derived, not hand-maintained

function createUser(rawBody: unknown) {
  const result = CreateUserSchema.safeParse(rawBody);
  if (!result.success) {
    // result.error.issues gives you field-level detail — exactly what
    // an RFC 9457 multi-error `errors` array (Lesson 1) wants as input.
    throw new ValidationError(result.error.issues);
  }
  const user: CreateUserDto = result.data; // now genuinely trustworthy
}
```

## 8. Failure scenarios

- **Trusting `req.body`'s TypeScript type without a runtime validation pipe actually wired up** — a very common, very real bug class where the code *looks* type-safe (a typed DTO parameter) but has zero runtime enforcement, because someone forgot to register the validation pipe globally or per-route.
- **Deserializing untrusted data into a class with dangerous defaults or prototype-pollution exposure** — some deserialization approaches, done carelessly, can be exploited to inject unexpected properties (a real, documented class of vulnerability in JS/Node ecosystems, notably in some npm packages' JSON-parsing extensions) — a reason `JSON.parse` plus explicit schema validation is safer than looser "just deserialize into whatever shape shows up" approaches.
- **Silent coercion masking bad input**: some validation libraries, if misconfigured, coerce `"42"` to `42` rather than rejecting the mismatched type — occasionally desirable (lenient query-string parsing) but dangerous when it hides a client bug that should have been surfaced as a `400`.

## 9. Common misconceptions

- **"TypeScript already validates this."** TypeScript validates that your *own code* is internally consistent at compile time; it has no runtime presence and validates nothing about data that arrived from outside your process.
- **"Validation is a performance cost I can skip for internal, trusted services."** Internal services are trusted right up until a deploy introduces a schema mismatch between two services that were supposed to agree — validation is as much about catching *your own* bugs early (a clear `400` at the boundary vs. a confusing failure three layers deep) as it is about adversarial input.
- **"JSON is basically free/format choice doesn't matter for performance."** At meaningful internal service-to-service volume, JSON's verbosity and (de)serialization cost are a real, measurable line item — this is precisely why gRPC/protobuf exist as a deliberate alternative, not a fashion choice.

## 10. Trade-offs

Decorator-based validation (`class-validator`) integrates smoothly with NestJS's existing DI-based architecture but risks the DTO class and its validation rules drifting from each other over time if not disciplined. Schema-first validation (Zod) guarantees the runtime schema and compile-time type can never drift, at the cost of a less framework-integrated, more manual wiring style in some NestJS setups. JSON's universality and debuggability cost bandwidth and CPU relative to protobuf's efficiency and schema-versioning overhead.

## 11. Real-world applications

- Every payment API (directly relevant to your stated fintech interest, and to Project 2) validates request shape *and* semantic constraints (a currency code is a valid ISO code, an amount is a positive integer of minor units, not a float — a real, common source of financial rounding bugs) far more strictly than a typical CRUD API, because the cost of a bad value making it through is categorically higher.
- OpenAPI/Swagger specs are, in effect, JSON Schema plus HTTP metadata — the same validation-contract concept extended to full API documentation and client-code generation.

## 12. Connections

Directly extends Lesson 1's uniform-interface and error-contract content — validation failures are exactly the errors RFC 9457 gives you a standard shape for. Sets up Lesson 5 (JWT — a token's *claims* still need validation after cryptographic verification, two separate steps commonly conflated) and previews Level 11 (Security — injection-class vulnerabilities are, at their root, a validation failure at a trust boundary).

## 13. Practical exercise

Take an endpoint you've built (or design one now) that accepts a nested object (e.g., an order with a list of line items). Write its validation schema in Zod, including at least one cross-field constraint (e.g., a discount percentage that must be 0 if a `couponCode` is absent). Identify: what happens today, in your actual code, if this validation weren't there — trace it through to see how far bad data would travel before something breaks.

## 14. Challenge

Your team is splitting a monolith into two internal services that will call each other over HTTP at high volume (Level 8 preview). Using this lesson's content, argue for or against switching that specific internal link to protobuf/gRPC, citing concrete cost/benefit factors rather than "it's more modern."

## 15. Mastery test

- Explain precisely why a TypeScript-typed function parameter provides no runtime guarantee, in terms of what TypeScript actually does at compile time vs. what happens to that information by runtime.
- Contrast decorator-based and schema-first validation approaches on the specific axis of type/validation-rule drift risk.
- Explain content negotiation's `Accept` header well enough to design a single endpoint that correctly serves both JSON and protobuf clients based on it.
