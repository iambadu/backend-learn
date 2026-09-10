# Cloud Fundamentals — VMs, Containers & Serverless, by the Numbers

## 1. Why does this exist?

"Serverless has no cold-start cost" is the roadmap's own flagged misconception, and cloud compute choice generally is one of the few architectural decisions in this curriculum with a genuinely precise, quantifiable answer available — this lesson gives you the actual numbers behind the trade-off, because "which compute model should we use" is a question with a real, calculable answer for a given workload, not a matter of taste or trend.

## 2. Mental model

A VM is renting a whole apartment, paying rent whether you're home or not. A container (Lesson 2) is renting a room in a shared apartment, cheaper because you're sharing the building's infrastructure. Serverless is paying by the minute for a hotel room that's only made up and ready the moment you actually walk in the door — genuinely cheap if you only need it occasionally, genuinely more expensive than just keeping an apartment if you're there most of the time.

## 3. Technical explanation

**Cold starts, precisely — what actually happens, and why it's not a fixed, ignorable cost:** when a serverless function hasn't been invoked recently, the platform must provision a fresh execution environment before it can handle the request — allocating compute resources, loading your function's code, and initializing its runtime — before any of your actual application logic runs. This is a real, measurable latency addition on top of everything Module 1 already taught about request latency, and it varies meaningfully by platform and workload: commonly-cited figures put AWS Lambda's cold start in the range of roughly 100-500ms for typical workloads, while a full VM boot (Fly.io-style) can run 1-3 seconds — a genuinely different order of magnitude, and directly, concretely relevant to any latency-sensitive endpoint's design. Once "warm" (an execution environment kept alive for a period after use, ready for a subsequent request without re-initializing), a serverless function responds without paying this cost again — but a genuinely low-traffic function, or one during a traffic lull, pays the cold-start cost on a real, non-trivial fraction of its invocations.

**The cost cross-over point — the specific, calculable answer to "serverless or containers," worth knowing the actual figures rather than a vague "it depends":** serverless pricing is typically per-invocation and per-duration (AWS Lambda charges by GB-seconds with per-millisecond granularity) — you pay only for actual execution time, nothing while idle. Container/VM pricing (AWS Fargate, as one concrete example) is typically per-hour of provisioned capacity, regardless of whether that capacity is actively handling requests. The concrete, documented consequence: **below roughly a 10% duty cycle** (the fraction of time your compute is actually doing work versus sitting idle), serverless is meaningfully cheaper; **above roughly 50% duty cycle** (or above roughly 50,000 invocations per day, in one commonly-cited concrete benchmark), containers become meaningfully cheaper — a cited example puts processing 50,000 images at roughly $4.80 on containers versus roughly $380 on serverless for the equivalent workload, a genuinely large, decision-relevant gap, not a marginal difference.

**Hidden costs worth naming explicitly, since they're easy to omit from a first-pass cost estimate and can meaningfully change the calculation:** serverless architectures commonly incur real, additional costs beyond the headline per-invocation price — NAT gateway fees for outbound network access (a real, per-availability-zone monthly cost, commonly cited around $33/month per AZ) and data-transfer charges between functions or services (commonly cited in the range of $0.01-0.09/GB) — costs that don't show up in a naive "serverless is basically free at low volume" mental calculation but matter for a real, complete cost comparison.

**When containers/VMs are the correct choice regardless of cost, because serverless is structurally unsuited to the workload, not merely more expensive — worth stating as hard constraints, not soft preferences:** a request needing to run longer than a platform's serverless execution time limit (commonly around 15 minutes on major platforms); a workload needing to maintain **persistent connections** (WebSockets, long-lived gRPC streams — serverless's per-invocation, stateless execution model is structurally incompatible with holding a connection open across multiple logical interactions); a workload needing **local, persistent, in-memory state across requests** (serverless execution environments are not guaranteed to persist between invocations, and are frequently recycled); or an endpoint with a **strict, low-latency SLA where cold-start variance is unacceptable** (a payment-authorization endpoint needing consistent sub-100ms response, directly relevant to Project 2, where an occasional 300ms cold-start spike would be a real, visible problem) — for any of these, containers (potentially with pre-warmed/minimum-instance configuration to avoid Lesson 2's per-request startup cost entirely) are the structurally correct choice, independent of the cost-crossover analysis above.

**Hybrid architectures — the genuinely practical, real-world answer for most systems, worth naming as the common default rather than treating "pick one model for everything" as the actual decision:** mixing serverless for genuinely sporadic, bursty, low-duty-cycle workloads (a nightly batch job, an occasional webhook handler) with always-on containers for core, high-duty-cycle, latency-sensitive traffic (your main API) is a real, documented cost-optimization pattern — a commonly-cited figure puts a well-designed hybrid approach at roughly 46% cheaper than an all-serverless architecture and roughly 26% cheaper than an all-container architecture for a realistic, mixed workload profile, precisely because different parts of a real system genuinely have different duty-cycle characteristics that a single, uniform compute-model choice can't optimize for simultaneously.

## 4. How it works internally

A "warm" serverless execution environment is, underneath, a container (Lesson 2) or micro-VM that the platform has deliberately kept alive past a single invocation specifically to amortize the cold-start cost across a burst of nearby requests — this is precisely why traffic patterns with genuine gaps between invocations pay the cold-start cost more often than traffic with tightly-clustered, frequent invocations, even at the identical total request volume.

## 5. Example

```
Workload: an internal webhook handler firing ~50 times/day, each run takes 2s.
Duty cycle: (50 × 2s) / 86400s ≈ 0.1% → deep in serverless's cost-favorable zone.

Workload: your main API, handling continuous traffic 24/7.
Duty cycle: near 100% → containers win decisively, per this lesson's cross-over figures.
```

## 6. Code

```yaml
# A hybrid deployment, concretely: main API always-on (containers),
# a sporadic background job serverless — matching each workload's
# actual duty cycle rather than forcing one compute model on both.
services:
  api:
    type: container
    min_instances: 2   # always warm — no cold-start risk for latency-sensitive traffic
  nightly-report:
    type: serverless   # sporadic, cold-start cost is irrelevant for a scheduled batch job
```

## 7. Failure scenarios

- **Choosing serverless for a payment-authorization endpoint (Project 2)** without accounting for cold-start latency variance — an occasional, unpredictable 300ms+ spike on a latency-sensitive, high-stakes path, a real, avoidable design mistake given this lesson's structural-constraint guidance.
- **Choosing an all-container architecture for a genuinely sporadic, low-duty-cycle workload** — paying for always-on capacity that sits idle the overwhelming majority of the time, a real, quantifiable cost inefficiency this lesson's duty-cycle analysis directly identifies.
- **Underestimating serverless's true cost** by ignoring NAT gateway and inter-service data-transfer fees in an initial estimate, then being surprised by the actual bill at scale.

## 8. Common misconceptions

- **"Serverless has no cold-start cost."** The roadmap's own flagged misconception — cold starts are a real, measurable, platform-dependent latency cost, not eliminated by the serverless model, just paid at different, less predictable moments than a container's fixed, upfront boot cost.
- **"Serverless is always cheaper because you only pay for what you use."** True per-unit, but "per-unit" pricing at high, sustained volume can exceed always-on capacity's amortized cost — the duty-cycle cross-over point is a real, calculable threshold, not a universal direction.
- **"The compute-model choice is uniform across an entire system."** Real, well-optimized architectures are commonly hybrid, matching each workload's actual duty cycle rather than forcing one model everywhere.

## 9. Trade-offs

Serverless: zero idle cost, genuine operational simplicity (no capacity planning), real cold-start latency variance, structural limits on execution duration and persistent state. Containers/VMs: predictable, always-warm latency, real idle-capacity cost, genuine capacity-planning responsibility. The correct choice is workload-specific, calculable from duty cycle and latency requirements, not a stylistic or trend-driven preference.

## 10. Real-world applications

- Project 2's core payment API should be container-based (or serverless with guaranteed minimum warm instances) given its latency-sensitivity and near-continuous traffic; a nightly reconciliation batch job (also Project 2-relevant) is a strong, direct serverless candidate given its sporadic, scheduled nature.
- This lesson's cost figures are directly, practically the kind of analysis a real infrastructure-cost review performs — not academic numbers, the literal basis for a real budgeting decision.

## 11. Connections

Directly depends on Lesson 2's container content (a "warm" serverless environment is, underneath, exactly that lesson's container mechanism) and Module 1's latency content (cold starts are a concrete, additional instance of that module's request-latency stack). Sets up Lesson 5 (Kubernetes as the orchestration layer for container-based deployment specifically).

## 12. Practical exercise

For three workloads you've built or can imagine (a public API, a nightly batch job, a webhook handler), estimate each one's duty cycle using this lesson's formula, and determine which compute model this lesson's cross-over guidance recommends for each — then check your reasoning against real, current pricing for a cloud provider of your choice.

## 13. Challenge

Design the compute-model allocation for Project 2's full system (payment API, webhook receivers, nightly reconciliation, notification sending) — assign each component to serverless, containers, or a specific hybrid arrangement, and justify each assignment using this lesson's duty-cycle and structural-constraint criteria, not a uniform default.

## 14. Mastery test

- Explain cold starts precisely enough to state why "warm" invocations avoid the cost and what specifically causes a "cold" one.
- State the approximate duty-cycle cross-over point between serverless and container cost-effectiveness, and explain why it exists in terms of each pricing model's structure.
- List the structural (not merely cost-based) reasons a workload might require containers regardless of its duty cycle.
- Explain why a hybrid architecture is often cheaper than either uniform choice, using this lesson's duty-cycle reasoning.
