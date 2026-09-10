# Load Testing & Benchmarking — Finding the Bottleneck Before Your Users Do

## 1. Why does this exist?

Every diagnostic technique this module has covered so far (percentiles, profiling, database tuning) assumes you already have a slow system in front of you to diagnose. Load testing is how you find out your system's actual limits **before** real traffic discovers them for you — a deliberate, proactive application of this whole module's measurement discipline, and the direct, practical implementation of Module 10, Lesson 4's capacity-planning content, which explicitly required "genuine load testing, not guessed" numbers.

## 2. Mental model

Load testing is a fire drill for your infrastructure — deliberately, safely simulating the exact kind of stress a real emergency would apply, specifically so you learn your system's actual failure points in a controlled setting, on your own schedule, rather than discovering them for the first time during a real, unplanned surge when the stakes are highest and your ability to calmly diagnose is lowest.

## 3. Technical explanation

**Open-loop vs. closed-loop load generation — Lesson 1's coordinated-omission content, now made directly actionable as a tool-selection criterion:** a **closed-loop** load generator issues its next request only after the previous one completes — meaning its effective request rate automatically, silently drops the moment your system under test slows down, precisely the mechanism that produces Lesson 1's coordinated-omission measurement bias. An **open-loop** load generator sends requests at a fixed, independent rate regardless of how quickly (or slowly) prior requests are completing — correctly modeling how real, independent users actually behave (a real user population doesn't collectively slow down its arrival rate just because your server is struggling) and correctly capturing the true severity of a slowdown rather than silently under-sampling it. **This is a concrete, practical tool-selection decision, not an abstract preference**: confirm whether your chosen load-testing tool defaults to open-loop or closed-loop behavior, and configure it explicitly for open-loop (constant-rate) generation whenever you're specifically trying to measure tail-latency behavior under sustained stress, per Lesson 1's content.

**The different test *shapes*, each answering a genuinely different question, worth distinguishing precisely since "load testing" is often used as a single, undifferentiated term for all of them:**
- **Smoke test**: minimal load, confirming the system and test setup itself work correctly before investing in a larger test — a sanity check, not a performance measurement.
- **Load test**: realistic, expected traffic levels, confirming the system meets its SLOs (Module 10, Lesson 2) under normal, anticipated conditions.
- **Stress test**: deliberately pushes load beyond expected levels, specifically to find the actual breaking point and observe *how* the system fails (Module 7, Lesson 8's graceful-degradation content, Module 10, Lesson 4's load-shedding content — does it degrade gracefully, per that lesson's design, or fail catastrophically, revealing a gap in that design?).
- **Spike test**: a sudden, sharp increase in load (simulating a viral moment, a flash sale) rather than a gradual ramp — specifically testing whether your system's autoscaling (Module 6, Lesson 1's queue-depth-driven scaling content) and connection pools (Module 3, Lesson 9) can react fast enough, or whether the sudden spike itself causes a cascading failure before scaling can catch up.
- **Soak test**: sustained, moderate load over a long duration (hours, not minutes) — specifically designed to surface problems that only manifest over time: a memory leak (Module 9, Lesson 1's failure scenario, Lesson 2's diagnostic content), connection-pool exhaustion from a subtle leak, or Module 3, Lesson 7's vacuum/bloat accumulation under sustained write load.

**Benchmarking a specific component in isolation vs. load-testing the whole system — a genuinely different scope, worth distinguishing since they answer different questions:** a **benchmark** measures a specific, isolated piece of code or component's performance directly (how fast does this specific hashing function run, Module 11, Lesson 3's Argon2 cost, measured in isolation) — useful for comparing implementation choices or confirming a specific optimization's actual effect, but it deliberately excludes the full system's real interactions (network, database contention, concurrent load from other requests). A **load test** exercises the whole, integrated system under realistic, concurrent conditions — necessary because real production bottlenecks (Module 3, Lesson 9's connection-pool contention specifically requiring *concurrent* load to manifest at all) simply don't appear in an isolated, single-threaded benchmark, no matter how precisely that benchmark measures its narrow, specific target.

**Finding the actual bottleneck from load-test results, worth stating as a specific, applied instance of Lesson 2's triage discipline:** as load increases, watch where throughput stops scaling linearly with added load, and correlate that specific inflection point against Lesson 2's category-specific diagnostics (is CPU saturating — Lesson 2's flame-graph content; is the database connection pool exhausted — Module 3, Lesson 9's specific signal, Lesson 3's separated-span instrumentation; is a downstream dependency's own rate limit being hit — Module 2, Lesson 6) — the load test's job is identifying *when and under what load* the system breaks; this module's other lessons supply the specific diagnostic tools for identifying *why*, once you know where to look.

## 4. How it works internally

`k6` (a widely-used, open-source load-testing tool, written for exactly this purpose) lets you define **virtual users (VUs)** — each an independent, simulated user running your test script in a loop — and choose explicitly between closed-loop (VU-count-driven) and open-loop (constant-arrival-rate-driven) execution models; running with an explicit, fixed request rate (rather than merely a VU count, which implicitly closed-loops if VUs wait for responses) is precisely how you avoid Lesson 1's coordinated-omission bias in practice, not merely in theory.

## 5. Example

```js
// k6, configured for open-loop (constant-rate) load, avoiding
// coordinated omission per Lesson 1's content:
import http from 'k6/http';
export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-arrival-rate',
      rate: 100,            // 100 requests/second, REGARDLESS of response time
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 200, // enough VUs to sustain the rate even if responses slow
    },
  },
};
export default function () {
  http.get('https://api.example.com/orders');
}
```

## 6. Code

```
# A stress test ramping load until failure, specifically to observe
# HOW the system fails (per Module 7, Lesson 8 and Module 10, Lesson 4):
k6 run --stage 1m:100,5m:100,1m:500,5m:500,1m:1000,5m:1000 stress-test.js
# Watch for: does throughput plateau gracefully (backpressure working
# as designed) or does latency spike catastrophically (a design gap)?
```

## 7. Failure scenarios

- **A closed-loop load test reporting acceptable p99 latency**, followed by real production traffic revealing dramatically worse tail behavior — exactly Lesson 1's coordinated-omission bias, discovered too late because the load-testing tool wasn't configured or verified to be open-loop.
- **Skipping soak tests entirely**, missing a slow memory leak or connection-pool exhaustion that only manifests after hours of sustained load — a real, common gap in load-testing practice that short-duration load/stress tests structurally cannot catch.
- **A stress test revealing catastrophic, ungraceful failure** rather than the graceful degradation Module 10, Lesson 4 designed for — discovering, deliberately and safely in a test environment, that the load-shedding policy either wasn't actually implemented correctly or wasn't triggered at the load level actually tested.

## 8. Common misconceptions

- **"Load testing and benchmarking are the same activity."** They answer genuinely different questions at genuinely different scopes — a benchmark isolates one component; a load test exercises the full, integrated system under realistic concurrent conditions, and bottlenecks requiring real concurrency (connection-pool contention) are invisible to the former.
- **"A single load-test run at expected traffic levels is sufficient."** Different test shapes (smoke, load, stress, spike, soak) each surface genuinely different classes of problem — relying on only one shape leaves real, specific failure modes (a slow memory leak, a poor response to a sudden spike) entirely untested.
- **"Any load-testing tool measures tail latency accurately out of the box."** Lesson 1's coordinated-omission content applies directly and practically here — verify and configure for open-loop, constant-rate generation specifically when tail latency under stress is what you're trying to measure.

## 9. Trade-offs

Load testing: real, proactive discovery of your system's actual limits and failure modes, at the cost of genuine setup effort (realistic traffic modeling, a safe, isolated environment to stress-test in without affecting real users) and real infrastructure cost to run tests at meaningful, production-representative scale.

## 10. Real-world applications

- Project 2's payment API, before any real launch, warrants the full suite of test shapes this lesson describes — smoke (does it work at all), load (does it meet its SLO under expected traffic), stress (how does it fail, and does load shedding work as Module 10, Lesson 4 designed), spike (can it handle a sudden surge), and soak (does anything degrade over sustained operation) — not merely a single, generic "load test."
- Module 10, Lesson 4's capacity-planning content is directly, practically operationalized by this lesson's testing — "what's your system's actual maximum sustainable throughput" is a question only a genuine load test, not an estimate, can actually answer.

## 11. Connections

Directly depends on Lesson 1's coordinated-omission content (the specific, practical reason open-loop load generation matters) and Lesson 2's profiling content (used to diagnose *why* once a load test reveals *where* a bottleneck emerges). Directly operationalizes Module 10, Lesson 4's capacity-planning requirement for genuine, measured load-testing data rather than estimates.

## 12. Practical exercise

Design and run all five test shapes (smoke, load, stress, spike, soak) against a system you've built, using an open-loop-configured tool, and document what each shape revealed that the others didn't — confirming this lesson's claim that they answer genuinely different questions, not redundant variations of one test.

## 13. Challenge

For Project 2, design a complete load-testing plan covering all five test shapes for the core payment-processing endpoint, specifying the expected traffic model for each, what failure mode each is specifically designed to catch, and how you'd use Lesson 2's diagnostic tools to investigate any bottleneck each test reveals.

## 14. Mastery test

- Explain why open-loop load generation is necessary to avoid coordinated omission, connecting directly to Lesson 1's mechanism.
- Distinguish smoke, load, stress, spike, and soak tests by the specific question each is designed to answer.
- Explain why a component-level benchmark can miss a real, concurrency-dependent production bottleneck that a full load test would catch.
- Given a described load-test result showing throughput plateauing at a specific load level, describe your diagnostic process using this module's other lessons to identify the actual bottleneck.
