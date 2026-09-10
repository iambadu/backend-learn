# Latency, Throughput & Percentiles — Why Averages Lie

## 1. Why does this exist?

Module 1, Lesson 9 already distinguished latency from bandwidth/throughput as physically different things fixed by different interventions. This lesson is the measurement discipline needed to actually *see* latency correctly — because the single most common performance-measurement mistake in the industry is reporting an average, and averages are, for latency data specifically, close to actively misleading rather than merely imprecise.

## 2. Mental model

Imagine 100 people crossing a room: 95 of them walk across in 2 seconds, 5 of them crawl across in 60 seconds because they're carrying something heavy. The *average* crossing time (about 5 seconds) describes literally nobody's actual experience — it's not close to the typical crossing (2 seconds) and it dramatically understates the worst crossings (60 seconds). Percentiles ask a different, more honest question: "what value did 50% of people beat" (p50, the median), "what value did 95% of people beat" (p95), "what value did 99% of people beat" (p99) — each one describing something real about the actual distribution, not an abstraction no one experienced.

## 3. Technical explanation

**Why latency is specifically ill-suited to averaging, mechanically, not just as a stylistic preference:** latency distributions are **long-tailed**, not normally distributed (bell-curve-shaped) — most requests cluster around a fast, typical value, but a real, non-trivial minority are dramatically slower, dragged out by causes with no symmetric fast-side counterpart: garbage-collection pauses (Module 3, Lesson 9's process-pause content), cold starts (Module 9, Lesson 4), lock contention (Module 3, Lesson 6), network jitter (Module 1). An average is dragged disproportionately by these outliers in one direction, with nothing on the fast side to balance it — and critically, **an average doesn't correspond to any actual request that happened**; a p99 value, by contrast, is literally the response time of a real request that occurred (the one at the 99th-percentile rank), which is precisely why percentiles are a meaningfully more honest description of what real users actually experienced.

**p50, p95, p99 — precisely what each one tells you, and which one to actually watch for which purpose:** sort every request's latency from fastest to slowest; p50 (the median) is the value at the halfway point — half of all requests were faster, half slower; p95 is the value 95% of requests beat, meaning the remaining 5% were slower; p99 is the value 99% of requests beat. **p50 is the right signal for capacity trends and typical-path regressions** — it tells you how the common case is behaving, largely unaffected by rare outliers. **p95 or p99 is the right signal for user-facing SLOs (Module 10, Lesson 2)** — because the tail is what disproportionately affects your most active users (a user making many requests is statistically more likely to eventually hit a tail-latency event than a user making one request) and, critically, **compounds across a multi-hop request chain** (Module 7, Lesson 8's timeout-budget content, directly): if a single user-facing request fans out to 100 backend calls, and each individual backend call has even a 1-in-100 chance of hitting its own tail-latency event, the probability that *at least one* of those 100 calls is slow is roughly 63% (`1 - 0.99^100`) — meaning a "rare" 1% tail-latency event at any single backend becomes the *majority*, not the minority, experience for any request that fans out widely enough, a genuinely counterintuitive, important consequence worth internalizing precisely.

**Coordinated omission — a real, well-documented, specific bias in how load-testing tools measure latency, worth knowing by name because it can make your measured percentiles wildly, silently wrong, in a way that's easy to never notice:** Gil Tene's well-known description of this problem: a **closed-loop** load generator (one that waits for a response before sending the next request — the naive, default approach many load-testing tools take) inadvertently **stops sending requests during exactly the period the system under test is struggling**, because it's waiting on the very slow response that struggle is causing — meaning it never actually samples the many requests that *would* have arrived during that struggling period under real, independent user traffic, and records only a single, understated outlier for what was actually a sustained period of poor service. The documented, concrete illustration: a system normally serving requests in 50ms that experiences a 5-second pause, tested at 10 requests/second with a naive closed-loop generator, records **one** 5-second-latency data point — when an **open-loop** generator (sending requests at a constant rate regardless of whether prior requests have completed — the correct approach, pioneered in tools like `wrk2` and adopted since by others) would have correctly recorded roughly 100 requests all experiencing that same pause, producing dramatically different, dramatically more accurate percentile statistics. This is a real, well-documented methodology bug that can make measured p99 numbers off by orders of magnitude, silently, without any error or warning — worth explicitly checking that whatever load-testing tool you use (Lesson 4) is open-loop, or configured to be, rather than assuming any tool measures this correctly by default.

**Throughput — the complementary measurement, worth precisely distinguishing from latency one final time given Module 1, Lesson 9's earlier introduction:** throughput is requests (or bytes) processed per unit time; latency is how long any single request takes. A system can have high throughput and poor tail latency simultaneously (processing many requests per second on average, while a meaningful fraction of individual requests take unacceptably long) — the two measurements are genuinely independent, and a performance investigation needs both, not one standing in for the other.

## 4. How it works internally

A percentile is computed by sorting a full, complete dataset of observed latencies and indexing into the sorted array at the appropriate rank — this is precisely why percentile computation, done correctly at scale, benefits from data structures designed for approximate, streaming percentile estimation (t-digest, HDRHistogram — the latter specifically designed by Gil Tene to avoid coordinated-omission-style measurement bias) rather than naively sorting an ever-growing array of every request ever observed, which becomes impractical at real production volume.

## 5. Example

```
1000 sorted latencies (ms), fastest to slowest:
p50 (index 500):  42ms   ← typical experience
p95 (index 950):  180ms  ← the tail beginning to show
p99 (index 990):  2400ms ← a real, meaningfully worse experience
Average: 95ms — closer to p50 in this example, but drifts toward
  the tail as outlier severity/frequency increases, and either way,
  corresponds to no actual request in the dataset.
```

## 6. Code

```ts
function percentile(sortedLatencies: number[], p: number): number {
  const index = Math.ceil((p / 100) * sortedLatencies.length) - 1;
  return sortedLatencies[Math.max(0, index)];
}
// ALWAYS sort first — computing this on unsorted data is meaningless.
const sorted = [...latencies].sort((a, b) => a - b);
console.log('p99:', percentile(sorted, 99));
```

## 7. Failure scenarios

- **Reporting and alerting on average latency alone** (Module 10, Lesson 3's alerting content) — masking a real, severe tail-latency problem affecting a meaningful fraction of users, invisible in the averaged number.
- **A load test using a naive, closed-loop tool**, producing percentile numbers that look acceptable but are actually a coordinated-omission artifact wildly understating real tail behavior — a false sense of confidence going into production, discovered only when real traffic (which doesn't "wait politely" the way a closed-loop tester does) reveals the actual, much worse tail behavior.
- **Optimizing p50 while ignoring p99** — genuinely improving the typical-case experience while leaving (or even worsening) the tail, which Module 10, Lesson 2's SLOs, correctly scoped to user-facing percentiles, would have caught as a real regression the p50-only view missed entirely.

## 8. Common misconceptions

- **"Average latency is a reasonable summary statistic for a latency distribution."** For a long-tailed distribution, it's a genuinely poor one, both because it's disproportionately dragged by outliers and because it corresponds to no real observed request — percentiles are the correct, standard tool for this specific kind of data.
- **"A 99% success rate at each hop is basically fine for a multi-hop request chain."** The compounding math shown in this lesson demonstrates it can become the *majority* failure/tail-latency experience at sufficient fan-out — a genuinely counterintuitive, important result worth internalizing precisely, not approximating.
- **"Any load-testing tool measures latency percentiles accurately by default."** Coordinated omission is a real, documented, easy-to-miss measurement bias that specifically affects naive closed-loop testing tools — worth explicitly verifying rather than assuming.

## 9. Trade-offs

Percentile-based measurement: a genuinely more accurate, more actionable description of real user experience, at the cost of needing slightly more sophisticated tooling (streaming percentile estimation at scale) than a naive running average. Open-loop load testing: correctly captures tail behavior under sustained struggle, at the cost of being marginally more complex to configure than the naive closed-loop default many tools ship with.

## 10. Real-world applications

- Module 10, Lesson 2's SLOs should always be defined against a specific percentile (commonly p95 or p99 for user-facing latency), never a raw average — this lesson is the direct, precise justification for that earlier lesson's implicit assumption.
- Project 2's payment API, given its multi-hop nature (calling an external payment provider, checking a database, Module 7 Lesson 6's saga steps), is exactly the kind of fan-out-prone system where this lesson's compounding-tail-latency math matters concretely, not abstractly.

## 11. Connections

Directly extends Module 1, Lesson 9's latency/bandwidth distinction with the measurement discipline needed to observe latency correctly, and Module 10, Lesson 2's SLO content (which this lesson retroactively justifies as percentile-based, not average-based). Sets up Lesson 4's load-testing content, where coordinated omission becomes directly, practically relevant.

## 12. Practical exercise

Take a dataset of latencies from a real or simulated endpoint (even a small, hand-generated one with a few deliberate outliers), compute the average, p50, p95, and p99, and compare how differently each summarizes the same underlying data — confirming this lesson's claims empirically rather than by assertion.

## 13. Challenge

For Project 2's payment-processing flow (which fans out to several downstream calls), estimate the probability that at least one downstream call experiences a tail-latency event, given each individual call's own p99 rate, using this lesson's compounding formula — and discuss what this implies for your Module 7, Lesson 8 timeout-budget design.

## 14. Mastery test

- Explain precisely why averages are a poor summary statistic for latency data, using the long-tail distribution argument.
- State which percentile is appropriate for capacity-trend monitoring versus user-facing SLO tracking, and why.
- Explain coordinated omission's mechanism precisely enough to state why a closed-loop load tester underreports tail latency during a system's struggling period.
- Compute the probability that at least one of N fan-out calls experiences a tail-latency event, given each call's individual tail-event probability.
