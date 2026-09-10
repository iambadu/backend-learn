# REST & API Design — Constraints, Maturity, Versioning, and Error Contracts

## 1. Why does this exist?

By the time you're designing an API, you already have TCP/HTTP underneath you (Module 1) — the question this lesson answers is: given that foundation, what structure should the *application-level* contract between client and server actually have, so that it stays maintainable, cacheable, and evolvable as the system grows? "REST" gets thrown around constantly as a synonym for "JSON over HTTP with normal-looking URLs," but that's a specific, much weaker thing than what the term originally meant — and knowing the gap between the two is what lets you make deliberate trade-offs instead of cargo-culting a convention.

## 2. Mental model

REST, as Roy Fielding actually defined it in his 2000 dissertation, is a *style of API design derived by starting from the web's own successful properties* (caching, statelessness, uniform interface, layered systems) and asking "what constraints produce those properties?" It's a set of architectural constraints you can apply partially or fully — most production "REST APIs" apply some of them and skip others, which is fine as long as you know which ones you're skipping and why, rather than assuming "REST" is a single checkbox.

## 3. Simple explanation

Fielding's REST is defined by six constraints: **client-server** separation, **statelessness** (Module 1, Lesson 5 — no server-side session state between requests), **cacheability** (responses must declare whether they're cacheable), **uniform interface** (a consistent way of identifying and interacting with resources — this is the constraint with the most sub-parts, see below), **layered system** (a client can't necessarily tell if it's talking directly to the origin server or through intermediaries — directly connects to Module 1's proxies/load balancers), and **code-on-demand** (optional — the server can extend client functionality by transferring executable code, e.g. JavaScript; the only *optional* constraint).

## 4. Technical explanation

**The "uniform interface" constraint, broken into its actual sub-constraints (this is where most "REST APIs" quietly diverge from the label):**
- Identification of resources (a URI identifies a resource — `/users/42`, not `/getUser?id=42`).
- Manipulation of resources through representations (you don't manipulate the resource directly, you send a *representation* of the desired state — a JSON body — and the server decides how to apply it).
- **Self-descriptive messages**: each message contains enough information to describe how to process it (e.g., `Content-Type` telling the receiver how to parse the body — Module 1, Lesson 5).
- **HATEOAS** (Hypermedia As The Engine Of Application State): responses include links describing what actions are available next, so a client discovers the API's state machine dynamically rather than hardcoding URL structure ahead of time. **This is the constraint almost every "RESTful" API in production skips entirely** — and it's the one Fielding himself has stated is a *precondition* for correctly calling something REST, not an optional nicety.

**The Richardson Maturity Model** gives you the vocabulary for exactly where a given API actually sits, instead of a binary "is/isn't REST" judgment:
- **Level 0**: a single URI endpoint, one HTTP method (typically POST), everything else (the actual operation) encoded in the body — essentially RPC-over-HTTP wearing HTTP's clothing (this is what most "REST" APIs from the SOAP-to-REST transition era actually were).
- **Level 1**: multiple URIs, one per resource — resources exist as a concept, but still typically one HTTP method for everything.
- **Level 2**: proper use of HTTP methods and status codes as they were designed (Module 1, Lesson 5's semantics — `GET` for reads, `POST` for creation, correct status codes for outcomes). **This is where the overwhelming majority of real production "REST APIs" sit** — well-structured, HTTP-semantics-respecting, but without hypermedia.
- **Level 3**: HATEOAS — the API becomes discoverable; a client following links from a root resource can navigate the entire available action space without out-of-band documentation. Fielding considers this the actual precondition for the REST label; almost nobody ships this level in practice because the tooling and client-side complexity cost rarely pays for itself outside specific domains (e.g., some hypermedia-heavy enterprise/EDI systems).

**Why this distinction matters practically, not just pedantically:** knowing you're building a Level 2 API, not a "true" Level 3 REST API, tells you honestly what you're giving up — client/server coupling to URL structure (clients hardcode paths instead of discovering them), and the loss of the specific evolvability guarantee hypermedia provides (you can't restructure your URL scheme without breaking every client, because there's no indirection layer). This is a real, common source of API versioning pain (see below), and understanding *why* it happens (skipping the HATEOAS constraint) is more useful than just accepting versioning as an unavoidable fact of life.

**API versioning strategies, and their actual trade-offs:**
- **URI versioning** (`/v1/users`, `/v2/users`) — simplest to implement and reason about, highly visible/cacheable per-version, but the most "un-RESTful" in Fielding's original sense (a URI is supposed to identify a *resource*, not a *version of an API* — this bakes API structure directly into resource identity).
- **Header versioning** (a custom header, or `Accept: application/vnd.myapi.v2+json` — media-type/content-negotiation-based versioning) — keeps URIs stable across versions (arguably more correct against the uniform-interface constraint), but is less discoverable/debuggable (you can't just paste a URL in a browser to see what version you're hitting) and interacts awkwardly with HTTP caching layers that key primarily on URL.
- **No versioning, additive-only evolution** — never remove or change the meaning of a field, only add optional ones; clients are expected to ignore fields they don't understand. This avoids the whole versioning problem but requires real discipline and doesn't work for breaking changes (renaming a field, changing a type, changing an endpoint's fundamental behavior).

**Error contracts — RFC 9457 (obsoleting the original RFC 7807), "Problem Details for HTTP APIs":** the actual, standardized answer to "what shape should my error responses have," rather than every API inventing its own. It defines a machine-readable JSON (`application/problem+json`) structure with standard fields — `type` (a URI identifying the error category, ideally dereferenceable to human documentation), `title` (a short, human-readable summary, constant per `type`), `status` (the HTTP status code, duplicated in the body for convenience), `detail` (a human-readable explanation specific to *this* occurrence), and `instance` (a URI identifying this specific occurrence, useful for correlating with logs/traces — direct preview of Level 10's observability). RFC 9457 (2023) adds guidance for returning *multiple* problems in one response (an `errors` array, each entry using a JSON Pointer to identify which field it concerns) — directly useful for validation-error responses reporting several invalid fields at once (Lesson 2 of this module).

## 5. How it works internally

A well-designed NestJS API implements the uniform interface and error-contract pieces of this lesson concretely: a global `ExceptionFilter` intercepts thrown errors and serializes them into a consistent `application/problem+json` shape regardless of where in the codebase the error originated, rather than leaking framework-specific stack traces or ad-hoc `{ error: "..." }` shapes that differ endpoint to endpoint.

## 6. Example

```
curl -s https://api.github.com/repos/nonexistent/nonexistent | jq
```
Compare GitHub's actual error body shape against RFC 9457's fields — real production APIs frequently implement something *close* to the standard without formally declaring the `application/problem+json` content type, which is itself a useful, concrete illustration of Level 2 (methods/status codes right) vs. full standards compliance.

## 7. Code

A Problem-Details-shaped error response in a NestJS exception filter:
```ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';

@Catch(HttpException)
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();

    response.status(status).type('application/problem+json').json({
      type: `https://api.example.com/errors/${exception.name}`,
      title: exception.message,
      status,
      instance: ctx.getRequest().url,
    });
  }
}
```

## 8. Failure scenarios

- **URI versioning without a deprecation policy**: `/v1` accumulates forever because nothing forces client migration — a real, common source of unbounded maintenance burden (every version must be kept working indefinitely).
- **Breaking a client by "just adding a field" that isn't actually additive** — e.g., changing a field from a single object to an array "to support multiple values" breaks any client doing strict type parsing, even though it felt additive to the API author.
- **Inconsistent error shapes across endpoints** (some return `{message}`, others `{error}`, others a stack trace in production) — a real, common source of fragile client error-handling code that breaks silently when a new endpoint doesn't follow the (undocumented) convention.

## 9. Common misconceptions

- **"REST means CRUD over HTTP with clean URLs."** That's Richardson Level 1–2, not REST as Fielding defined it — a useful, common, perfectly legitimate style to build, but conflating it with "REST" obscures what you're actually trading away (discoverability, evolvability without versioning).
- **"HATEOAS is a nice-to-have I can add later."** Skipping it isn't a minor omission — it's the specific decision that creates your API's versioning problem in the first place, by coupling clients to URL structure that a hypermedia layer would otherwise abstract.
- **"GraphQL or gRPC replaced REST because REST was flawed."** They solve different problems (over/under-fetching for GraphQL, strongly-typed RPC efficiency for gRPC) — neither addresses or claims to address the specific architectural properties (cacheability, statelessness, uniform interface) Fielding's constraints were derived from.

## 10. Trade-offs

Full REST (Level 3, hypermedia-driven) buys long-term evolvability and loose client/server coupling at the cost of real implementation and client-tooling complexity. Level 2 REST (what almost everyone actually builds) is simpler to build and consume but pushes the coupling problem into explicit API versioning, which then has its own maintenance cost. Neither is "wrong" — they're different points on a real trade-off curve, and the honest engineering move is knowing which one you picked and why.

## 11. Real-world applications

- Stripe's API is a commonly cited example of disciplined Level 2 design with strong additive-evolution discipline (rarely breaking changes, extensive use of expandable/optional fields) rather than hypermedia — a real, working alternative to both extremes.
- RFC 9457 problem-details responses are directly consumed by API gateway/observability tooling (Level 10) that can automatically categorize and alert on error `type` values across a fleet of services.

## 12. Connections

Depends entirely on Module 1, Lesson 5 (HTTP semantics — REST's uniform interface constraint is built directly on correct HTTP method/status usage) and Lesson 8 (layered systems — REST's layered-system constraint is exactly what makes load balancers/proxies transparent to the client). Directly sets up this module's remaining lessons (validation errors will use the RFC 9457 shape; idempotency and pagination are both uniform-interface design decisions).

## 13. Practical exercise

Take an API you've built or used regularly and classify it on the Richardson Maturity Model, citing specific evidence (URL structure, method usage, presence/absence of hypermedia links) for your classification — not a guess.

## 14. Challenge

You're designing a public API that you know will need breaking changes over its lifetime (payment providers change fee structures, fields get restructured). Choose a versioning strategy, defend it against the two alternatives from this lesson, and describe your deprecation policy for old versions — how do you actually force migration without breaking existing integrations abruptly?

## 15. Mastery test

- List all six of Fielding's REST constraints and, for each, state one concrete architectural property it's responsible for producing.
- Explain precisely why Richardson Level 2 (what most production APIs are) doesn't meet Fielding's definition of REST, and what specific capability is lost as a result.
- Design an RFC 9457-compliant error response for a request that fails validation on three separate fields simultaneously.
