# Sessions & Cookies — Faking State on Top of a Stateless Protocol

## 1. Why does this exist?

Module 1, Lesson 5 established that HTTP is stateless — the server retains no memory of a client between requests. But almost every real application needs the *appearance* of state: "you're logged in," "here's your cart." Sessions and cookies are the mechanism that manufactures that appearance without violating HTTP's actual statelessness — the client re-presents an identifier on every request, and the server (or a JWT's self-contained claims, Lesson 5) reconstructs "who this is" fresh, every time, rather than truly remembering anything between requests.

## 2. Mental model

A cookie is a coat-check ticket. The server (the coat check) doesn't remember your face — it remembers "ticket #4471 corresponds to this coat." Every time you come back, you show the same ticket, and the server looks up what it means. The ticket itself can be meaningless to anyone else who finds it (a random opaque session ID, useless without the coat-check's own records) or it can directly encode the claim itself in a tamper-evident way (a JWT, Lesson 5) — two structurally different designs for the same underlying job.

## 3. Simple explanation

A **cookie** is a small piece of data the server asks the browser to store and automatically re-send on every subsequent request to that origin (`Set-Cookie` response header; `Cookie` request header). A **session**, in the classic server-side sense, is server-held state (in memory, or more realistically in a shared store like Redis or PostgreSQL) keyed by an opaque identifier the cookie carries — the cookie itself contains no meaningful information on its own, just a lookup key.

## 4. Technical explanation

**Cookie attributes, and what each one is actually defending against:**
- **`HttpOnly`**: the cookie is inaccessible to JavaScript (`document.cookie` won't see it) — this specifically defends against **XSS** (Level 11): even if an attacker manages to inject and run JavaScript on your page, they can't read and exfiltrate an `HttpOnly` session cookie through that script.
- **`Secure`**: the cookie is only ever sent over HTTPS, never plain HTTP — defends against network eavesdropping (Module 1, Lesson 6's whole point) capturing the cookie in transit.
- **`SameSite`**: controls whether the cookie is sent on **cross-site** requests (a request initiated from a different site than the cookie's own origin) and is the primary browser-level defense against **CSRF** (Cross-Site Request Forgery). Three values, with real, different behavior:
  - **`Strict`**: never sent on cross-site requests, period — including when a user clicks a link from an external site into your logged-in app, which can break "click this link and land already logged in" flows.
  - **`Lax`** (the default in Chromium-based browsers since Chrome 80, for any cookie that doesn't explicitly declare a `SameSite` value): sent on top-level, "safe" cross-site navigations (a user clicking a link — a `GET` request), but *not* sent on cross-site subresource requests, form submissions via non-GET methods, or fetch/XHR calls initiated from another site. This is the practical, real-world default balance most sites end up with.
  - **`None`** (requires `Secure` to be set alongside it): sent on every cross-site request — fully disables this layer of CSRF protection, needed only for legitimate cross-site use cases (an embedded widget, a third-party payment iframe) where the cookie genuinely must travel cross-site.
- **Critical, commonly missed nuance**: `SameSite=Lax`'s exemption for top-level `GET` navigation is precisely why Module 1 Lesson 5's point about `GET` being required to be safe (no side effects) matters as a *security* property, not just a caching/infrastructure one — if a `GET` endpoint has a side effect (violating that constraint), `SameSite=Lax` provides **zero** CSRF protection for it, because Lax's whole design assumes GET is safe and deliberately allows it through.

**Session storage architecture — where "the session" actually lives, and why this became less of a forced trade-off than it used to be:** a classic argument for JWTs (Lesson 5) over server-side sessions was that sessions require server-side state, which seemed to conflict with horizontal scaling (Module 1's point that stateless HTTP servers are trivially scalable) — an in-memory session on Server A is invisible to Server B, breaking the moment a load balancer (Module 1, Lesson 8) routes a user's next request to a different backend. The actual, current-practice resolution: **store the session in a shared, external store (Redis is the dominant choice, sub-millisecond latency at very high throughput)**, not in any individual server's memory — this makes your *application servers* stateless at the infrastructure level (any server can handle any request, satisfying Module 1's scalability property) while still using genuinely server-side, centrally-revocable session state at the application level. This directly undercuts the older "JWTs scale better because sessions don't" argument for typical SaaS/API load profiles — a Redis-backed session lookup adds a small, usually negligible network round-trip, and in exchange buys you something JWTs structurally cannot: **instant, trivial revocation** (delete the Redis record; the session is dead immediately) versus a JWT's revocation problem (a signed token remains cryptographically valid until it expires, no matter what the server "wants," unless you build a separate blacklist/checking mechanism that itself reintroduces the state you were trying to avoid — Lesson 5 covers this in depth).

**The realistic, current-practice hybrid** many production systems land on: browser-facing sessions use an opaque session ID in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie backed by Redis (or similar) — optimizing for revocability and the fact that a browser session naturally wants cookie-based transport anyway. Internal service-to-service calls (Level 8), where there's no browser and no cookie jar, use short-lived JWTs instead — optimizing for the fact that a downstream service can verify a JWT's signature locally without a network round-trip to a shared session store, which matters more at high internal call volume than it does for a comparatively low-volume browser-facing login flow.

## 5. How it works internally

On login, a NestJS/Express session middleware (backed by a Redis session store, e.g. `connect-redis`) generates a cryptographically random session ID, writes `{ userId, ... }` to Redis keyed by that ID, and sends `Set-Cookie: sid=<random-id>; HttpOnly; Secure; SameSite=Lax`. On every subsequent request, the middleware reads the `sid` cookie the browser automatically attached, looks it up in Redis, and — if found and unexpired — populates `req.session`/`req.user` before your route handler runs. Logout is a single Redis `DEL` on that key — the session is gone everywhere, instantly, for every server in your fleet, with no coordination needed beyond all servers sharing the same Redis instance/cluster.

## 6. Example

```
curl -v -c cookies.txt -X POST https://api.example.com/login -d '{"email":"...","password":"..."}'
curl -v -b cookies.txt https://api.example.com/me
```
The second request only succeeds because `curl -b` re-attaches the cookie the first response set — this is the entire mechanism, made explicit instead of invisible browser behavior.

## 7. Code

```ts
// A minimal session-cookie setup illustrating the attributes that matter:
res.cookie('sid', sessionId, {
  httpOnly: true,   // unreachable from JS — XSS mitigation
  secure: true,      // HTTPS only — eavesdropping mitigation
  sameSite: 'lax',   // cross-site request restriction — CSRF mitigation
  maxAge: 1000 * 60 * 60 * 24, // 24h — an explicit, deliberate lifetime, not "forever"
});
```

## 8. Failure scenarios

- **A `GET` endpoint with a side effect, relying on `SameSite=Lax` for CSRF protection**: as explained above, Lax explicitly allows top-level GET navigations through — a classic CSRF vulnerability that survives *because* the endpoint violated Module 1 Lesson 5's method-safety contract, not despite having SameSite configured.
- **Session fixation**: failing to regenerate the session ID after a privilege change (e.g., after login) lets an attacker who fixed a victim's pre-login session ID (via some injection vector) inherit the now-authenticated session — a real, specific, named attack class with a specific, standard mitigation (always regenerate the session ID on authentication state change).
- **Storing sensitive data directly in a cookie instead of behind an opaque session ID** — even with `HttpOnly`/`Secure` set, a cookie's contents are still visible to browser extensions, proxies (Module 1, Lesson 8), and anyone with device access; the opaque-ID-plus-server-side-lookup pattern exists specifically so the cookie itself is worthless if intercepted.

## 9. Common misconceptions

- **"Sessions don't scale, that's why everyone uses JWTs now."** This was a stronger argument before shared, high-throughput session stores (Redis) became the trivial default — for typical SaaS/API load, a Redis lookup's cost is negligible against the revocation and simplicity it buys back.
- **"`SameSite=Lax` fully solves CSRF."** It solves CSRF for correctly HTTP-semantics-respecting endpoints (state changes never on `GET`) — it does *not* protect an endpoint that violates that assumption, and doesn't help at all once `SameSite=None` is set for a legitimate cross-site need.
- **"`HttpOnly` cookies are immune to theft."** They're immune to *JavaScript-based* theft (XSS) specifically — they remain vulnerable to network interception without `Secure`, and to anyone with direct access to the browser's cookie storage or the network path.

## 10. Trade-offs

Server-side sessions (even Redis-backed): trivial, instant revocation; a small extra network hop per request; requires operating a shared store. JWTs (Lesson 5): no per-request store lookup, self-contained verification; structurally hard, indirect revocation. The hybrid pattern (sessions at the browser edge, JWTs for internal service calls) is increasingly the pragmatic default specifically because it applies each mechanism where its strength matters most, rather than picking one dogmatically for the whole system.

## 11. Real-world applications

- Nearly every consumer web app with a "log out of all devices" feature is directly leveraging server-side session revocability — a feature that's straightforward with Redis-backed sessions and awkward to build correctly with pure JWTs.
- BFF (Backend-For-Frontend) architectures explicitly implement the session-at-the-edge, JWT-internally hybrid pattern as a named, deliberate architectural choice, not an accident.

## 12. Connections

Directly extends Module 1, Lesson 5 (HTTP statelessness — this whole lesson is the standard workaround for it) and sets up Lesson 5 of this module (JWT) as the alternative/complementary mechanism. Feeds Level 11 (Security — XSS, CSRF, session fixation are all named OWASP-relevant vulnerability classes covered here at the mechanism level).

## 13. Practical exercise

Audit an app you've built (or a public API you can inspect via browser DevTools' Application/Cookies tab): for every cookie set, identify whether `HttpOnly`, `Secure`, and `SameSite` are set, and for any that aren't, articulate the specific, concrete attack that omission enables — not just "it's less secure."

## 14. Challenge

Design the session architecture for Project 4 (Multi-Tenant SaaS): browser-based dashboard users, a mobile app, and server-to-server API key access for third-party integrations. Decide, and defend, which of session-cookie, JWT, or a hybrid applies to each of the three client types, and why a single uniform mechanism across all three would be the wrong call.

## 15. Mastery test

- Explain precisely why `SameSite=Lax`'s exemption for top-level GET navigation depends on HTTP method-safety semantics (Module 1, Lesson 5) actually being respected by the endpoint.
- Walk through exactly what happens, mechanically, when a Redis-backed session is deleted on logout — and contrast that with what "deleting" a JWT-based session actually requires.
- Define session fixation precisely enough to identify the specific code change (session ID regeneration on auth-state change) that prevents it.
- Argue, with specifics, for the hybrid session/JWT pattern over using either mechanism uniformly across a full-stack SaaS product with both browser and internal-service clients.
