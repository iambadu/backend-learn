# Logs, Metrics & Traces — The Three Pillars of Observability

## 1. Why does this exist?

By this point in the curriculum, you can build a correct, well-architected system — but a correct system you can't see into when it breaks is only correct until the first real production incident, at which point "correct" stops mattering and "diagnosable" becomes everything. This lesson is about the instrumentation that turns "something is wrong" into "here's exactly what, where, and why" — the direct prerequisite for Lesson 3's incident-response content, which is meaningless without this lesson's data actually existing when you need it.

## 2. Mental model

If your system were a patient, **metrics** are vital signs on a monitor (heart rate, blood pressure — numbers over time, telling you *something* is wrong and roughly how severe). **Logs** are the patient's detailed medical chart (specific, timestamped events — telling you *what happened*, in detail, at a specific moment). **Traces** are a security camera following one specific person's entire path through the hospital (showing you *where* in a whole, multi-department journey something went wrong). You need a monitor to notice a problem exists, a chart to understand a specific past event in detail, and a camera trail to understand how a problem in one department affected a person's entire visit — no single one of the three substitutes for the other two.

## 3. Technical explanation

**Metrics — numerical measurements aggregated over time, optimized for detecting *that* something is wrong, cheaply, at scale:** CPU usage, request latency (Level 12 will make percentile-based latency measurement, not averages, the standard here), error rate, request throughput — metrics are cheap to store and query precisely because they're pre-aggregated numbers, not full event detail, which is exactly what lets you cheaply watch thousands of time series continuously without the storage/query cost full log retention at the same granularity would require. Metrics answer "is something wrong, and roughly how bad" — they are the right tool for **detection**, not diagnosis.

**Logs — timestamped records of discrete events, optimized for understanding exactly what happened at a specific moment:** a log line capturing a specific request's outcome, a specific error's stack trace, a specific business event occurring. **Structured logging** — worth naming as a specific, deliberate discipline rather than "just write descriptive log lines" — means emitting logs as consistent, queryable fields (a `service`, `timestamp`, `request_id`, `error_code`, `user_id`, each a distinct, indexed field) rather than unstructured free-text strings a human has to parse visually. This distinction has real, direct consequences: a structured log can be queried precisely ("show me every error for this specific `user_id` in this time window") the way Module 3's indexed queries can, while an unstructured log requires grep-and-hope at genuine production scale, where the volume of log lines makes manual scanning impractical.

**Traces — following one request's entire path through a distributed system, optimized for understanding *where* in a multi-service journey something went wrong:** a **trace** represents one logical request's end-to-end journey; it's composed of **spans**, each representing one unit of work within that journey (a specific service call, a specific database query) — and critically, every span carries the same **trace ID**, letting you reconstruct the entire request's path across every service it touched, with timing for each individual step. This is the direct, necessary tool for exactly the multi-hop latency problems Module 7, Lesson 8 discussed (a slow request somewhere in a chain of service calls) — without tracing, diagnosing "which of the five services this request touched was actually slow" requires manually correlating separate logs from five different services by rough timestamp, an error-prone, slow process tracing eliminates by design.

**Why all three together, and specifically in this order, is the actual, practical diagnostic workflow — not three independent, interchangeable tools, but a deliberate pipeline:** metrics detect that a problem exists (an error-rate spike, a latency-percentile regression) — cheap, always-on, watching everything. Once detected, traces show you *where* in a distributed request's path the problem is concentrated (which specific service or database call is actually slow or failing). Once you've narrowed to a specific service and time window, logs give you the specific, detailed event data explaining *why* — the actual error message, the actual input that triggered it. Mature observability practice explicitly **correlates all three via a shared trace ID or request ID** (embedded in log lines, attached to metrics as labels, matching a trace's own ID) — this is what makes jumping directly from "this metric spiked" to "here's the exact trace" to "here's the exact log line explaining it" a fast, connected workflow rather than three separate, manually-correlated data sources.

## 4. How it works internally

A request entering your system through Module 8, Lesson 5's API gateway is assigned a trace ID at the edge; that ID is propagated (typically via an HTTP header) to every downstream service call the request triggers — each service, on receiving the header, starts its own span as a child of the incoming trace, does its work, and (critically) includes the same trace ID in any log lines it emits during that request's processing — this single, propagated identifier is the entire mechanism that makes cross-pillar correlation possible; without deliberately propagating it through every hop (a real, easy-to-miss implementation detail, especially across Module 6's asynchronous, queue-based service boundaries where the propagation mechanism differs from a direct synchronous call), the trace breaks and reconstruction becomes impossible past that point.

## 5. Example

```json
{
  "timestamp": "2026-09-10T14:32:01Z",
  "level": "error",
  "service": "payment-api",
  "trace_id": "a1b2c3d4",
  "request_id": "req-9981",
  "user_id": "42",
  "message": "payment provider timeout",
  "provider_latency_ms": 5200
}
```
This single, structured line is directly, precisely queryable ("show me every `payment provider timeout` for `trace_id: a1b2c3d4`") in a way an unstructured `"payment failed for user 42, took a while"` string is not.

## 6. Code

```ts
// Propagating a trace ID through a service call — the mechanism
// that makes cross-pillar, cross-service correlation possible at all:
async function callPaymentProvider(req: Request) {
  const traceId = req.headers['x-trace-id'] ?? generateTraceId();
  logger.info('calling payment provider', { trace_id: traceId, user_id: req.userId });
  return fetch(providerUrl, { headers: { 'x-trace-id': traceId } }); // propagated onward
}
```

## 7. Failure scenarios

- **Unstructured, free-text logging at real production scale** — an incident investigation reduced to grepping millions of unstructured lines by eye, a genuinely slow, error-prone process this lesson's structured-logging discipline directly prevents.
- **A trace ID not propagated across an async, queue-based boundary** (Module 6's messaging content) — the trace breaks the moment a request's work continues via a queue rather than a direct call, losing the ability to connect "the API request that triggered this" to "the background job that eventually processed it."
- **Relying on metrics alone for diagnosis**, not just detection — a metric can tell you *that* error rate spiked, never *why*, without traces and logs to actually explain the specific cause.

## 8. Common misconceptions

- **"Logs are sufficient observability on their own."** They're the right tool for detailed, specific-event diagnosis, but genuinely poor for cheap, continuous, at-scale anomaly detection (Lesson 3's alerting content is built on metrics specifically, not raw log volume) and for understanding cross-service request paths without tracing.
- **"More logging is always better."** Unstructured, excessive, low-signal logging is both a real cost (storage, query performance) and a real diagnostic hindrance (signal buried in noise) — structured, deliberately-chosen logging is the actual goal, not maximal volume.
- **"Tracing is only necessary for microservices."** Even a modular monolith (Module 8, Lesson 1) benefits from tracing across its internal module boundaries and any external calls it makes — the need scales with the complexity of a request's actual path, not strictly with deployment topology.

## 9. Trade-offs

Metrics: cheap, always-on, low-detail. Logs: detailed, genuinely queryable when structured, real storage/query cost at high volume. Traces: essential for multi-hop diagnosis, real implementation discipline required (consistent propagation across every service and async boundary) to actually work end-to-end.

## 10. Real-world applications

- Every project from here forward in this curriculum should instrument at minimum structured logging with trace-ID propagation — this isn't optional, advanced tooling, it's baseline production hygiene directly enabling Lesson 3's incident-response content to function at all.
- Project 5's (Distributed System) multi-service architecture makes tracing specifically non-optional — diagnosing a cross-service latency problem without it is close to impossible at real scale.

## 11. Connections

Directly extends Module 7, Lesson 8's multi-hop latency content (tracing is the diagnostic tool for exactly that problem) and Module 6's async messaging content (trace propagation across queue boundaries is a real, specific implementation challenge). Sets up Lesson 2 (SLIs are, precisely, metrics chosen deliberately to measure what users actually experience) and Lesson 3 (alerting is built on metrics, investigation on logs and traces).

## 12. Practical exercise

Add structured logging with a propagated trace ID to a small multi-service or multi-module system you've built, deliberately trigger a failure spanning more than one component, and confirm you can reconstruct the full request path and root cause using only your logs, correlated by trace ID.

## 13. Challenge

Design the observability instrumentation for Project 5: what specific metrics, what structured log fields, and how trace IDs propagate across both synchronous service calls and Module 6's asynchronous queue boundaries — including the specific mechanism for maintaining trace continuity across that async gap.

## 14. Mastery test

- Explain what each of the three pillars is optimized for, and why none substitutes for the other two.
- Explain structured logging precisely enough to state what makes a log line queryable versus merely readable.
- Explain how a trace ID makes cross-pillar correlation possible, and what breaks that mechanism across an asynchronous queue boundary.
- Explain the practical diagnostic workflow (metrics → traces → logs) and why that specific order is the efficient one.
