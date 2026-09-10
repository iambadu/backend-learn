# Rate Limiting — Algorithms, Boundary Bugs, and Doing It Correctly Across Multiple Servers

## 1. Why does this exist?

Rate limiting protects a system from being overwhelmed — by a genuinely malicious client, a buggy retry loop (Module 1's congestion-control content has a direct analogue here: uncontrolled retry storms are a self-inflicted denial-of-service), or just legitimately high demand exceeding provisioned capacity. It's also a security control, not only a performance one (Level 11 will revisit it as a brute-force/credential-stuffing defense). The algorithm you pick has real, different failure characteristics — this is not an interchangeable implementation detail.

## 2. Mental model

Every rate-limiting algorithm is answering the same question — "has this client made too many requests recently?" — but they differ in *how they define "recently"* and *how precisely they track it*, and those two choices are exactly where the trade-offs live.

## 3. Simple explanation

- **Fixed window counter**: divide time into fixed-size buckets (e.g., one-minute windows), count requests per bucket, reset the counter at each boundary. Simplest to implement, cheapest to store (one counter per client per window).
- **Sliding window log**: keep a timestamp for every individual request, and count how many fall within the trailing window at any instant. Exact, no boundary artifacts — but memory grows with request volume, since every request's timestamp is retained until it ages out.
- **Sliding window counter**: an approximation that avoids the log's memory cost — keep counters for the current and immediately previous fixed window, and estimate the trailing window's count by weighting the previous window's count by how much it overlaps the current rolling window. Gets you close to the log's accuracy at O(1) memory.
- **Token bucket**: a bucket holds up to some maximum number of tokens, refilling at a steady rate; each request consumes a token, and is rejected if none remain. Naturally allows short bursts (as long as tokens have accumulated) while still enforcing a long-run average rate.
- **Leaky bucket**: conceptually the reverse of token bucket — requests fill a bucket, and are processed ("leak out") at a fixed, steady rate regardless of arrival burstiness, smoothing output even if input is bursty. Rejects new requests once the bucket is full rather than allowing a burst through.

## 4. Technical explanation

**The fixed window counter's real, well-documented flaw — the boundary-burst problem:** because the counter resets sharply at each window boundary, a client can send its full allowed quota in the last moment of one window, and *another* full quota in the first moment of the next window — two back-to-back bursts, each individually within the stated limit, but together delivering up to **2x** the intended rate in a short span straddling the boundary. This isn't a rare edge case; it's a structural property of the algorithm, and it's the single most common reason a "rate limit" turns out not to actually cap real-world burst rate the way its stated number implies.

**Sliding window counter's actual accuracy, with real production numbers, not just "it's an approximation":** Cloudflare has published production measurements of this exact algorithm (used in their own rate-limiting infrastructure) showing roughly 0.003% wrong-decision rate across a sample of 400 million requests from 270,000 distinct sources — meaning in practice, the approximation is good enough that its ~O(1) memory savings over the sliding log are essentially free, which is why it's frequently the pragmatic production default rather than the theoretically-exact sliding log.

**Token bucket's specific advantage — it's the most common choice for API rate limiting specifically because it distinguishes "burst tolerance" from "sustained rate" as two separately tunable parameters:** bucket capacity controls how large a burst is tolerated; refill rate controls the long-run sustained average. This maps naturally onto real API usage patterns (a client legitimately batching several calls at once, then going quiet) in a way fixed-window counting doesn't — you can allow the burst *without* raising the sustained-rate limit, which a naive fixed-window increase cannot do independently.

**GCRA (Generic Cell Rate Algorithm) — the algorithm actually underlying most serious production, Redis-backed rate limiters (e.g., `redis-cell`), and worth knowing by name because you'll encounter it directly if you ever look inside a rate-limiting library:** GCRA is mathematically equivalent to a leaky-bucket limiter, but implemented via a clever trick that needs only **a single stored value per client** — the "theoretical arrival time" (TAT) of the next compliant request — rather than physically maintaining a counter or a log. Each incoming request compares the current time against the stored TAT: if the request arrives late enough relative to TAT (given the configured rate), it's allowed and TAT is advanced; if it arrives too early, it's rejected. This gets you token-bucket-equivalent burst/sustained-rate semantics at genuinely minimal storage cost (one Redis key, one value) and, critically, can be implemented as an **atomic** check-and-update via a single Redis command or Lua script — directly solving the distributed correctness problem below.

**Distributed rate limiting — why "just check a counter" breaks the moment you have more than one server:** if each of your API servers keeps its own local, in-memory counter, a client can get up to (limit × number of servers) requests through, simply by having its requests land on different servers behind your load balancer (Module 1, Lesson 8) — the limit is only being enforced *per server*, not globally, which usually isn't the intent. The fix is a **shared, external store** (Redis, again) that every server checks and updates — but this reintroduces a genuine distributed-systems correctness problem (Level 7 will formalize this): two servers racing to check-and-increment the *same* counter concurrently can both read "under limit" before either writes back the increment, letting both requests through when only one should have been allowed — a classic **race condition**, not a hypothetical one. The fix requires the check-and-update to be **atomic** — either a single Redis command (`INCR` combined with a TTL, or a purpose-built rate-limiting command like `CL.THROTTLE`) or a Lua script executed atomically inside Redis (Redis executes Lua scripts without interleaving other clients' commands mid-script) — this is precisely why GCRA's single-value, single-atomic-operation design is attractive for distributed deployment: there's no read-then-write gap for a race to exploit.

**A further, real subtlety for GCRA (and any timestamp-based scheme) specifically in a distributed deployment:** because the algorithm's correctness depends on comparing timestamps, and different application servers' system clocks can drift relative to each other (Module 1's TLS lesson touched on clock skew for a different reason), a robust distributed implementation typically uses the *shared store's own clock* (e.g., Redis's `TIME` command) as the single source of truth for "now," rather than trusting each application server's local clock — otherwise clock skew between servers can itself become a rate-limit-bypass vector.

## 5. How it works internally

A NestJS rate-limiting guard backed by Redis, using GCRA-equivalent logic, runs (conceptually) on every incoming request: read the client's identifying key (user ID, API key, or IP — see failure scenarios below for why the choice matters), execute an atomic Redis operation that both checks whether this request is compliant *and* updates the stored state in one round trip, and either proceed or reject with `429 Too Many Requests` (ideally including a `Retry-After` header — a real, standard signal to well-behaved clients about when to try again, directly relevant to Level 6's exponential-backoff content).

## 6. Example

```
for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" https://api.example.com/endpoint; done
```
Run against any rate-limited public API and watch for `429` responses appearing, along with a `Retry-After` or `X-RateLimit-Remaining` header — real production rate limiters almost universally expose their current state to well-behaved clients via response headers, rather than leaving them to guess.

## 7. Code

```ts
// A GCRA-style check via Redis, expressed conceptually (a real implementation
// uses an atomic Lua script, not separate GET/SET calls, to avoid the race
// condition described above):
const script = `
  local tat = tonumber(redis.call('GET', KEYS[1])) or 0
  local now = tonumber(redis.call('TIME')[1])
  local emission_interval = tonumber(ARGV[1]) -- seconds per request at sustained rate
  local burst = tonumber(ARGV[2])
  local new_tat = math.max(tat, now) + emission_interval
  local allow_at = new_tat - (burst * emission_interval)
  if now < allow_at then
    return 0 -- rejected
  else
    redis.call('SET', KEYS[1], new_tat, 'EX', 60)
    return 1 -- allowed
  end
`;
```

## 8. Failure scenarios

- **Fixed-window boundary bursts** (described above) — silently permits up to 2x the stated rate.
- **Rate limiting keyed on IP address alone**: many legitimate users can share one IP (NAT, corporate networks, mobile carrier-grade NAT — Module 1, Lesson 1) — over-limiting them collectively as if they were one client; conversely, a determined attacker can trivially rotate IPs to bypass an IP-only limit entirely. Keying on an authenticated identity (user ID, API key) where available is almost always more correct.
- **Local, per-server counters in a multi-server deployment** — the limit is silently multiplied by server count, as described above.
- **A race condition from a non-atomic check-then-increment** against a shared store — under concurrent load, more requests get through than the stated limit, exactly when the limit matters most (a traffic spike or an actual attack).

## 9. Common misconceptions

- **"429 responses mean rate limiting is working correctly."** Seeing some 429s tells you the limiter is active, not that it's enforcing the *intended* rate accurately — a fixed-window limiter can be issuing 429s while still letting 2x the intended burst rate through at window boundaries.
- **"Rate limiting is purely a defensive/security feature."** It's equally a capacity-management tool protecting your own downstream dependencies (a database connection pool, Level 3/12) from being overwhelmed by legitimate but excessive traffic — not just adversarial traffic.
- **"Any shared counter in Redis automatically solves the distributed case."** Only if the check-and-update is atomic — a naive read-then-write-in-application-code pattern against a shared Redis key still races exactly like an in-memory counter would, just shared instead of per-server.

## 10. Trade-offs

Fixed window: cheapest, simplest, boundary-burst-prone. Sliding log: exact, memory-expensive at scale. Sliding window counter: near-exact at O(1) memory, the common pragmatic default. Token bucket/GCRA: naturally separates burst tolerance from sustained rate, minimal storage (GCRA especially), and is the standard choice when burst-friendliness is a deliberate product requirement rather than purely a defensive minimum.

## 11. Real-world applications

- Stripe, GitHub, and most major public APIs expose `X-RateLimit-Limit`/`X-RateLimit-Remaining`/`X-RateLimit-Reset` headers (or a close variant) — a direct, standard convention letting well-behaved clients self-throttle before hitting a hard `429`.
- `redis-cell`, a production Redis module implementing GCRA, is a real, directly usable implementation of everything in this lesson's algorithm section, rather than something you'd typically hand-roll from scratch in a production system.

## 12. Connections

Depends on Module 1's congestion-control content (Lesson 2 — both are, at their core, mechanisms for keeping demand within a system's actual capacity) and Lesson 8 (load balancers — the reason per-server local counters fail is directly a consequence of how a load balancer distributes requests across your fleet). Sets up Level 6 (`Retry-After` and backoff behavior on the client side of a rate-limited response) and Level 11 (rate limiting as a brute-force defense).

## 13. Practical exercise

Implement a fixed-window rate limiter (in-memory, single process is fine for the exercise) and write a test that deliberately demonstrates the boundary-burst problem — send a full quota's worth of requests in the last 100ms of one window and another full quota in the first 100ms of the next, and confirm both bursts succeed, delivering roughly 2x the stated limit in under 200ms.

## 14. Challenge

Design the rate-limiting strategy for Project 2's payment API: what should be limited (per API key? per endpoint? globally per account?), what algorithm fits the requirement that legitimate retry-after-timeout behavior shouldn't itself trigger a false rate-limit rejection, and how do you avoid the distributed race condition across your (necessarily multi-server) payment infrastructure.

## 15. Mastery test

- Explain the fixed-window boundary-burst problem precisely enough to construct a concrete numeric example (a specific limit and a specific timing) demonstrating it.
- Explain what GCRA stores per client and why that's sufficient to reproduce token-bucket-equivalent behavior without maintaining a literal token count.
- Explain exactly why a per-server in-memory counter fails once a load balancer is introduced, tying the explanation back to Module 1, Lesson 8's content on how requests get distributed.
- Describe the specific race condition that a non-atomic distributed rate-limit check is vulnerable to, and what makes an atomic Redis operation immune to it.
