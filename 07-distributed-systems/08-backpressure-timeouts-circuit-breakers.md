# Backpressure, Timeouts & Circuit Breakers — Failing Fast on Purpose

## 1. Why does this exist?

Every failure-handling mechanism this module has covered so far assumes you can eventually detect a failure and react to it. This lesson is about the more immediate, everyday problem: a healthy service under real load must actively defend itself against being overwhelmed by upstream demand, and must actively defend *other* services from being overwhelmed by its own downstream calls to them — without either defense mechanism itself becoming the next point of failure. This is the module's most directly, immediately applicable content for the production systems you'll actually operate.

## 2. Mental model

Backpressure is a barista telling the next customer in line "we're at capacity, please wait" instead of accepting every order and letting the kitchen quietly fall further and further behind — an explicit, honest signal beats silent, growing overload. A circuit breaker is refusing to keep calling a phone number that's been busy for the last ten attempts, instead of dialing it an eleventh time and tying up your own hands waiting for a busy signal you could have predicted.

## 3. Technical explanation

**Backpressure — the mechanism for a system to explicitly signal "I can't accept more work right now," rather than silently degrading:** without backpressure, a system under load beyond its capacity doesn't fail cleanly — it degrades in a way that's often worse than an outright rejection: requests queue up invisibly, memory grows as unprocessed work accumulates (a genuine callback to Module 2, Lesson 9's streaming-upload backpressure content — the exact same underlying concept, applied here at the level of whole-system request handling rather than a single stream's byte flow), and latency for *everyone*, including requests that would otherwise have succeeded quickly, degrades together. Explicit backpressure — rejecting new work once a queue depth (Module 6, Lesson 1's own health signal, applied here as an active control mechanism, not just a passive metric) or concurrency limit is reached, typically with a `503 Service Unavailable` and ideally a `Retry-After` header (Module 2, Lesson 6's rate-limiting response convention, applied to overload generally rather than a specific per-client quota) — keeps the system operating within its actual capacity, serving the requests it *can* handle promptly, rather than accepting everything and having all of it degrade together.

**Timeouts — the client-side discipline that makes backpressure and failure detection actually actionable, and the specific, common mistake of getting them wrong:** a request without a timeout can wait **indefinitely** for a response that may never come — and worse, while waiting, it typically holds real resources (a connection, a thread or event-loop callback, Module 3, Lesson 9's expensive database-connection resources if the call is database-bound) that could otherwise serve other work. A well-chosen timeout bounds how long you're willing to wait before treating a call as failed and moving on — but choosing the *right* timeout value is a real, non-trivial design decision: too short, and you abandon calls that would have succeeded given slightly more time (turning transient slowness into unnecessary failures); too long, and you hold resources and delay failure detection unnecessarily, exactly the false-negative side of Lesson 4's failure-detection trade-off, now applied to individual request calls rather than whole-node liveness.

**Timeout budgets — a genuinely important, often-missed refinement for systems with multi-hop call chains, worth stating precisely because a naive per-hop timeout policy is a real, common design flaw:** if service A calls B, which calls C, and each independently applies a fixed, generous timeout (say, 10 seconds each), a request that's ultimately going to fail at C can consume up to 30 seconds of A's own caller's patience before A even finds out — the correct approach is a **timeout budget** that decreases as a request travels deeper into a call chain (A allocates, say, 5 of its own 10-second budget to its call to B, which must then further subdivide *its* remaining budget for its own call to C), so that the total end-to-end latency a request can consume is bounded by the *outermost* caller's actual patience, not the sum of every individual hop's independently-chosen timeout.

**Circuit breakers — the mechanism that stops a client from repeatedly, wastefully calling a downstream service that's already known to be failing, directly extending Module 6, Lesson 2's retry-storm content to the calling side rather than the message-redelivery side:** a circuit breaker tracks the recent failure rate of calls to a specific downstream dependency and operates in three states:
- **Closed** (normal operation): requests flow through to the real downstream service, and failures are being counted; if the failure rate crosses a configured threshold within a window, the breaker **trips**.
- **Open**: every call fails **immediately**, without ever actually attempting the network call to the (presumed-still-struggling) downstream service — this is the entire point: it stops your own service from wasting connections, threads, and time waiting on calls that are statistically very likely to fail anyway, and just as importantly, it stops adding *your* load to a downstream service that's already struggling, directly preventing your client from becoming part of the retry-storm problem Module 6, Lesson 2 described. After a configured cooldown period, the breaker transitions to half-open.
- **Half-open**: a small number of test requests are allowed through to check whether the downstream service has actually recovered — if they succeed, the breaker closes (resumes normal operation); if they fail, it reopens (waits for another cooldown period before testing again).

**Why a circuit breaker is a genuinely different, complementary mechanism to a timeout, not a redundant one — worth stating precisely since they're easy to conflate:** a timeout bounds how long *one* call can take before giving up; a circuit breaker prevents *future* calls from being attempted at all once a pattern of failure has been detected — a timeout protects you from one slow call, a circuit breaker protects you (and the struggling downstream service) from many repeated, doomed calls. Production resilience libraries (and the pattern generally, regardless of specific implementation) combine both, plus retry-with-backoff (Module 6, Lesson 2) as a third, complementary layer — each addressing a genuinely distinct part of the same overall problem.

## 4. How it works internally

A circuit breaker wrapping an outbound HTTP client call in a NestJS service intercepts every call: in the closed state, it passes the call through and records success/failure; on tripping open, it short-circuits immediately, returning a fast, predictable failure (often a fallback response, or a clear error the calling code can handle gracefully) without ever making the actual network call — meaning downstream failures during an open-circuit period cost your service essentially nothing in latency or resources, compared to every one of those calls independently timing out the slow way.

## 5. Example

```
Service A → Service B → Service C (each with a 10s naive fixed timeout)
Request to A ultimately fails deep in C after 9s.
A doesn't find out until: B's 10s timeout to C expires (~10s),
then A's 10s timeout to B expires (~another 10s) → ~20s total,
even though the actual failure was known at the 9s mark.

With a timeout BUDGET: A allocates 10s total, passes ~7s to B,
B passes ~4s to C — C's failure surfaces within A's own 10s budget,
not compounding across every hop independently.
```

## 6. Code

```ts
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private openedAt = 0;

  async call<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt < 30_000) return fallback(); // fail fast
      this.state = 'half-open';
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
      this.failures++;
      if (this.failures >= 5) { this.state = 'open'; this.openedAt = Date.now(); }
      return fallback();
    }
  }
}
```

## 7. Failure scenarios

- **No timeout on a downstream call**, letting a single slow dependency exhaust your own service's available connections/threads/event-loop capacity while waiting indefinitely — a real, common way one struggling downstream service takes down an otherwise-healthy upstream one.
- **A naive per-hop fixed timeout policy in a multi-hop call chain**, producing exactly the compounding-delay problem the example above traces — a real, common source of "why did this simple request take 30 seconds to fail" incidents.
- **No circuit breaker**, meaning every one of your service's requests to a struggling downstream dependency independently retries and times out the slow way, both wasting your own resources and adding load to the very service that's already failing — directly worsening the outage you're trying to survive.

## 8. Common misconceptions

- **"A generous timeout is always safer than a short one."** It delays failure detection and holds resources longer — the right timeout is a deliberate trade-off (Lesson 4's false-positive/false-negative framing again), not "as long as possible just in case."
- **"Retries alone are sufficient resilience — you don't need a circuit breaker too."** Retries (Module 6, Lesson 2) without a circuit breaker can still contribute to a retry storm against an already-struggling dependency — a circuit breaker is what actually stops sending requests once failure is detected, a genuinely distinct, complementary mechanism.
- **"Backpressure means the system is broken."** An explicit, honest `503` under real overload is a system working *correctly* — it's silently accepting more than it can handle, and degrading everyone's experience together, that represents an actual design failure.

## 9. Trade-offs

Backpressure: honest, bounded degradation under overload, at the cost of explicitly rejecting some requests that a less-disciplined system might have "attempted" (and then failed anyway, just less predictably). Circuit breakers: fast failure and downstream protection during real outages, at the cost of occasionally rejecting a call that might have actually succeeded (a false positive, in Lesson 4's vocabulary) during the open-state cooldown window.

## 10. Real-world applications

- Every serious microservices architecture (Level 8) needs this lesson's content as baseline infrastructure — timeout budgets, circuit breakers, and backpressure are standard, expected resilience patterns in any production system with meaningful service-to-service call chains, not advanced or optional techniques.
- Project 5 (Distributed System) will require explicit application of all three mechanisms across its service boundaries — this lesson's content is directly load-bearing for that project's design.

## 11. Connections

Directly extends Module 2, Lesson 9's streaming-backpressure content (the same concept, applied at a higher, whole-request level) and Module 6, Lesson 2's retry/backoff content (circuit breakers are the complementary "stop trying" mechanism to retry's "try again" mechanism). Depends on Lesson 4's failure-detection trade-off framing (timeout and circuit-breaker thresholds are exactly that lesson's false-positive/false-negative trade-off, applied to individual calls and dependencies rather than whole-node liveness).

## 12. Practical exercise

Implement the circuit breaker above wrapping a deliberately-failing mock downstream call, and confirm: it trips to open after the configured failure threshold, fails fast (no actual call attempted) while open, and correctly tests recovery via the half-open state once the cooldown elapses.

## 13. Challenge

Design the resilience strategy (timeouts, budget allocation across hops, circuit breakers, backpressure) for Project 5's service call chain, and justify each specific threshold/timeout value chosen, using this lesson's false-positive/false-negative trade-off reasoning rather than arbitrary round numbers.

## 14. Mastery test

- Explain why backpressure's explicit rejection is preferable to silent, growing overload, using this lesson's degradation argument.
- Explain the timeout-budget problem in multi-hop call chains and how allocating a shrinking budget per hop solves it.
- Distinguish a circuit breaker from a retry mechanism precisely — what does each one actually prevent that the other doesn't?
- Trace a circuit breaker's three states and the specific transition triggers between each.
