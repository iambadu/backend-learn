# HTTP Semantics

## 1. Why does this exist?

TCP (Lesson 2) gives you a reliable byte stream between two machines — but a byte stream has no concept of "a request," "a method," "a status," or "when does this message end." HTTP is the application-layer protocol that imposes structure on that byte stream so that a client and server can agree on what a "request" and "response" even mean. You already use HTTP daily; this lesson is about the parts of it that are usually absorbed as framework defaults rather than deliberately understood.

## 2. Mental model

HTTP is a strict, request-response conversation format layered on top of TCP's raw byte stream. Every request declares an intent (the method) against a resource (the URL), and every response declares an outcome (the status code) — and the protocol's whole design is built around those two vocabularies being predictable enough that generic infrastructure (caches, proxies, load balancers) can make decisions without understanding your specific application.

## 3. Simple explanation

An HTTP request is: a method (`GET`, `POST`, ...), a path, headers (metadata), and optionally a body. A response is: a status code, headers, and optionally a body. HTTP itself is **stateless** — the protocol has no built-in memory of a previous request (that's why sessions/cookies/JWTs, Level 2, exist as an application-layer workaround, not an HTTP feature).

## 4. Technical explanation

**Methods and their real semantics (not just "what they're used for" — what infrastructure is *allowed to assume*):**
- `GET` — safe (must not change server state) and idempotent (repeating it has the same effect as doing it once). Because it's safe, it can be cached, prefetched, and retried by intermediaries without asking you.
- `POST` — neither safe nor idempotent by default. This is *why* browsers warn on form resubmission and why naive retry logic on `POST` is dangerous (Level 2's idempotency lesson is the direct payoff of this fact).
- `PUT` — idempotent by contract (replacing a resource with the same payload twice has the same end state), not safe.
- `PATCH` — neither safe nor idempotent by default (partial update — applying the same patch twice can have a different effect, e.g., "increment by 1").
- `DELETE` — idempotent by contract (deleting an already-deleted resource is still "deleted").
- `HEAD` — like GET but returns headers only, no body — used to check resource metadata (existence, size, `ETag`) cheaply.
- `OPTIONS` — used to ask what methods/behavior are allowed (this is the mechanism behind CORS preflight requests you've almost certainly debugged before).

**Status code classes** (the class matters more to infrastructure than the specific code — a proxy or cache can make a decision from the class alone):
- `1xx` informational (rare in day-to-day API work — e.g., `100 Continue`).
- `2xx` success.
- `3xx` redirection (`301` permanent, `302`/`307` temporary — the permanent/temporary distinction affects whether clients and caches *remember* the redirect).
- `4xx` client error — the client did something the server won't accept as-is; retrying identically won't help.
- `5xx` server error — the server failed; retrying *may* help (this distinction is exactly what automated retry logic, Level 6/7, should be keyed on: retry 5xx and specific 429s, generally don't blindly retry 4xx).

**Statelessness, precisely:** the server is not required to retain any information about a client between requests. This is what makes HTTP horizontally scalable by default — any server behind a load balancer (Lesson 8) can handle any request, because no request depends on server-side memory of a prior one. Everything that *looks* like state (logged-in sessions, shopping carts) is actually the client re-presenting identifying information (a cookie, a token) on every request, and the server looking that up fresh each time.

**Headers worth knowing precisely, not just recognizing:**
- `Content-Type` — tells the receiver how to parse the body. Mismatched `Content-Type` vs actual body format is a real, common bug.
- `Content-Length` — how the receiver knows where the body ends in a stream that has no inherent message boundary (recall Lesson 2: TCP is just bytes). Alternative: `Transfer-Encoding: chunked`, used when the length isn't known upfront (streaming responses).
- `Cache-Control`, `ETag` — directly previews Level 5 (Caching); HTTP has its own caching semantics that predate and parallel application-level caching (Redis, etc.).

## 5. How it works internally

A framework like NestJS (built on Express/Fastify, itself built on Node's `http` module) is doing, underneath your `@Get()` decorator: reading bytes off the TCP socket, parsing them according to the HTTP spec (finding the request line, headers, determining body length from `Content-Length` or chunked framing), and only then invoking your handler. The "server" object you never think about is managing exactly the socket-to-structured-request translation this lesson describes.

## 6. Example

```
curl -v https://api.github.com
```
The `-v` flag shows you the literal request and response headers on the wire — this is the actual protocol, not a framework's abstraction of it. Compare it against what your NestJS controller "sees" — the framework has already parsed all of this for you by the time your handler runs.

## 7. Code

Raw HTTP without a framework, to see what's actually being parsed for you normally:
```js
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  console.log(req.method, req.url);
  console.log(req.headers);

  if (req.method === 'GET' && req.url === '/users/1') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 1 }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

server.listen(3000);
```

## 8. Failure scenarios

- **Retrying a non-idempotent POST blindly**: a client times out waiting for a response to a "create payment" POST and retries — if the original request actually succeeded server-side and the response was just lost in transit, you now have two payments. This is precisely why idempotency keys exist (Level 2) — the method's semantics alone don't save you.
- **Trusting `Content-Length` from an untrusted client without validation**: mismatched or malicious length headers are a real class of parsing bugs/attacks.
- **Caching a response that shouldn't be cached** because a `GET` endpoint isn't actually safe (e.g., a `GET` that logs an analytics event with side effects most people don't think of as "state changing," or worse, one that actually mutates data) — infrastructure assumes `GET` is safe and will cache/prefetch/retry it accordingly; violating that contract causes real bugs.

## 9. Common misconceptions

- **"REST means CRUD over HTTP with clean URLs."** That's a common convention, not what HTTP or REST require — REST is a broader architectural style (Level 2 covers this properly); HTTP methods having specific safety/idempotency semantics is the part that actually has teeth for infrastructure behavior.
- **"PATCH and PUT are interchangeable."** PUT implies replacing the whole resource idempotently; PATCH implies a partial, not-necessarily-idempotent modification. Using PUT for partial updates breaks the idempotency contract clients and infrastructure may rely on.
- **"HTTP being stateless means I can't have sessions."** You can — the *server* just isn't allowed to be the only place that state lives without the client re-presenting an identifier every time. This is a design constraint that shapes the solution, not a limitation that blocks it.

## 10. Trade-offs

Statelessness costs you: every request must carry enough context to be self-sufficient (auth tokens, etc.), which has payload/latency overhead compared to a stateful protocol that "remembers." It buys you: trivial horizontal scaling, since no server needs to be "the one that has this user's session in memory."

## 11. Real-world applications

- CDNs and reverse proxies (Lesson 8) make caching decisions based on method safety and `Cache-Control`/`ETag` headers — this lesson is the prerequisite for understanding *why* those headers do what they do.
- API design reviews frequently catch bugs rooted in violating method semantics (a `GET` with side effects, a non-idempotent `PUT`) — this is a real, recurring code-review category, not academic trivia.

## 12. Connections

Sits directly on top of Lesson 2 (TCP) — HTTP is solving "how do we structure a conversation over a byte stream." Feeds directly into Level 2 (Backend Fundamentals — REST, idempotency, auth) and previews HTTP caching (Level 5) and status-code-based retry logic (Level 6/7).

## 13. Practical exercise

Design (on paper, not code yet) the request/response shape for an endpoint that increments a counter. Decide: is this `POST` or `PATCH`? Is it idempotent as you've designed it? If a client's request times out and it retries identically, what happens to the counter — and is that the behavior you actually want?

## 14. Challenge

A teammate wants to add a `GET /reports/generate` endpoint that triggers a slow report-generation job as a side effect, because "GET is simple, no body needed." Using this lesson's content on method safety, explain concretely what will break, in what infrastructure, and propose the correct method instead.

## 15. Mastery test

- Define "safe" and "idempotent" for HTTP methods precisely enough to correctly classify all seven common methods without guessing.
- Explain, mechanically, how a server knows where an HTTP request body ends, given that TCP has no message boundaries.
- What, exactly, does "HTTP is stateless" forbid, and what does it not forbid?
