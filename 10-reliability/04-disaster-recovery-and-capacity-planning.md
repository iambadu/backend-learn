# Disaster Recovery, Graceful Degradation & Capacity Planning

## 1. Why does this exist?

Every mechanism this module has covered so far assumes the system stays roughly within its designed operating envelope. This lesson is about the two edges of that envelope: what happens when something fails so badly that data or an entire region is at risk (disaster recovery, extending Module 3, Lesson 10's RPO/RTO content to the whole system), and what happens when demand exceeds capacity (graceful degradation and load shedding) — both are about designing deliberately for the moment things go wrong at scale, rather than hoping that moment never arrives.

## 2. Mental model

Fault tolerance is a building with reinforced walls, trying to prevent a fire from starting or spreading at all. Graceful degradation is that same building's sprinkler system and fire doors — accepting a fire might happen anyway, and deliberately containing its damage so the whole building doesn't burn down, sacrificing one room to save the rest. Disaster recovery is the off-site copy of the building's blueprints and a rebuilding plan — for the case where containment itself fails and you need to reconstruct from scratch, somewhere else entirely.

## 3. Technical explanation

**Fault tolerance vs. graceful degradation — a real, precise distinction worth stating exactly, since the two are often conflated:** fault tolerance tries to **prevent failures from being visible at all**, via redundancy (Module 3, Lesson 9's replication, Module 7, Lesson 3's consensus-backed leader failover) — the system masks the failure, and ideally, users never notice anything happened. Graceful degradation **accepts that some failures will become visible** and focuses on controlling and containing their impact rather than eliminating them — using exactly the mechanisms Module 7, Lesson 8 already gave you (circuit breakers, timeouts, backpressure) plus two additional, specific techniques this lesson introduces: **feature flags/kill switches** and **load shedding**.

**Feature flags as a deliberate resilience control plane, not merely a product/experimentation tool — worth naming this specific, distinct use case precisely:** a **degradation flag** is normally on, and is specifically designed to be flipped off, instantly, without a code deployment, under operational stress — "disable personalized recommendations and serve a generic, cached list instead," "disable the real-time notification badge and fall back to a periodically-refreshed count." This turns graceful degradation from an improvised, in-the-moment scramble during an incident into a **deliberate, pre-built, tested runtime capability** — the decision of "what's essential and what can be dropped under stress" is made calmly, in advance, not invented under pressure during an actual incident (directly connecting to Lesson 3's incident-response content — a pre-built kill switch is exactly the kind of tool a well-prepared on-call responder reaches for, rather than needing to write and deploy a fix live during an ongoing incident).

**Load shedding — the deliberate, explicit decision to refuse some requests in order to preserve service for the rest, directly extending Module 7, Lesson 8's backpressure content to a system-wide, prioritized policy:** under extreme load, rather than letting every request degrade together (Module 7, Lesson 8's "everyone's latency degrades together" failure mode), load shedding deliberately drops or deprioritizes **specific, chosen categories** of traffic — non-critical background requests, lower-priority API tiers, or a random sample of excess traffic beyond capacity — specifically to preserve capacity for the traffic that matters most (Project 2's actual payment-processing requests, versus, say, a less critical reporting/analytics endpoint sharing the same infrastructure). **Adaptive load shedding**, worth knowing as the more sophisticated, production-grade version: shedding thresholds tied dynamically to real signals — CPU saturation, queue depth (Module 6, Lesson 1's health signal, used here as an active control input rather than just a passive metric), or Lesson 2's SLO burn rate — rather than a single, static, manually-tuned threshold, adapting the shedding behavior to actual, current system state.

**Disaster recovery, formalized — Module 3, Lesson 10's RPO/RTO content, extended from "one database" to "the whole system, potentially across an entire region's failure":** a genuine disaster-recovery plan specifies, for the whole system, not just concretely: how much data loss is acceptable in a worst-case scenario (RPO), how long a full recovery is expected to take (RTO), and — critically, the part most commonly skipped — **whether that RTO has actually been tested**, not merely assumed. A DR plan's untested RTO is, precisely as Module 3, Lesson 10 warned for a single database, an *unknown*, not an optimistic estimate — the only way to actually know your real recovery time is to have genuinely exercised the recovery process, ideally under conditions resembling a real incident (a scheduled, deliberate "game day" exercise, restoring from an actual backup into a genuinely separate environment, not merely inspecting that a backup file exists).

**Capacity planning — the deliberate, proactive discipline of knowing your system's actual limits before you're forced to discover them under real, unplanned load:** this means having real, current answers (not stale, months-old estimates) to: what's your system's actual maximum sustainable throughput (measured via genuine load testing, Level 12's content, not guessed); what's the single most constrained resource in your architecture (Module 3, Lesson 9's connection-pool ceiling, or a downstream third-party API's own rate limit, Module 2, Lesson 6) that will become your bottleneck first as load grows; and what's your actual lead time to add real capacity (spinning up new container instances, Module 9, Lesson 2, is fast; provisioning genuinely new database capacity, Module 3, Lesson 10's partitioning/sharding content, is not) — capacity planning is precisely what tells you, in advance, whether your system can absorb a specific, anticipated demand spike (a marketing campaign, a seasonal traffic surge relevant to a marketplace-style Project 4 feature) or whether you need to proactively provision ahead of it.

## 4. How it works internally

A production incident response combining this module's full content, traced end to end: Lesson 1's metrics detect an anomaly → Lesson 3's symptom-based, burn-rate alert pages the on-call engineer → they use Lesson 1's traces and logs to localize the problem → they flip a pre-built degradation flag (this lesson) to shed non-critical load and preserve the core service → once stabilized, Lesson 3's blameless postmortem documents what happened and what systemic gap (a missing capacity buffer, an untested DR assumption) allowed it, feeding directly into this lesson's capacity-planning and DR-testing discipline for the future.

## 5. Example

```
Load shedding policy, tied to Lesson 2's SLO burn rate:
  Burn rate < 1x:   serve all traffic normally
  Burn rate 1-3x:   shed lowest-priority background/batch requests
  Burn rate 3-10x:  additionally disable non-critical features (flags)
  Burn rate > 10x:  shed all but the core, revenue-critical request path
```

## 6. Code

```ts
// A degradation flag checked at request time — no deploy needed to
// flip it off under operational stress, per this lesson's content:
async function getRecommendations(userId: string) {
  if (await flags.isEnabled('personalized-recommendations')) {
    return computePersonalizedRecommendations(userId); // expensive, real-time
  }
  return getCachedGenericRecommendations(); // cheap, degraded fallback
}
```

## 7. Failure scenarios

- **No pre-built degradation flags**, forcing an on-call engineer to write and deploy an emergency code change live, under pressure, during an active incident — real, avoidable risk and delay this lesson's "decide in advance" discipline directly prevents.
- **An untested DR plan's RTO turning out to be far longer than assumed** once an actual disaster forces a real recovery attempt — Module 3, Lesson 10's "unknown, not optimistic" warning, now realized at the worst possible moment.
- **No capacity planning ahead of a known, anticipated demand spike** (a product launch, a marketing campaign) — the system fails under load that was genuinely predictable and preventable with proactive provisioning, not a surprise failure mode.

## 8. Common misconceptions

- **"Fault tolerance and graceful degradation are the same thing."** Fault tolerance masks failure via redundancy; graceful degradation accepts visible failure and deliberately contains its impact — genuinely different strategies, often used together, not interchangeable terms.
- **"Load shedding means the system is broken."** It's a deliberate, correct response under genuine overload — refusing some traffic to preserve the rest is a working system operating exactly as designed under conditions beyond its provisioned capacity, not a failure of the system itself.
- **"We have a disaster recovery plan" (meaning a written document, never exercised).** Per Module 3, Lesson 10's content, an untested plan's actual RTO is unknown, not merely unverified-but-probably-fine.

## 9. Trade-offs

Fault tolerance: transparent to users, real redundancy cost (Module 3, Lesson 9's replica infrastructure). Graceful degradation: visible but contained impact, requires real upfront design discipline (deciding what's essential in advance) to execute well under pressure. Capacity planning: real, ongoing investment in load testing and proactive provisioning, in exchange for not discovering your system's actual limits during a real, unplanned incident.

## 10. Real-world applications

- Project 2's payment API is exactly the kind of core, revenue-critical path that a well-designed load-shedding policy should protect first, shedding lower-priority traffic (reporting, analytics) before ever touching it.
- Project 4's multi-tenant SaaS, if it anticipates seasonal or marketing-driven traffic spikes, needs this lesson's capacity-planning discipline applied concretely, not assumed away.

## 11. Connections

Directly extends Module 3, Lesson 10's RPO/RTO content to whole-system disaster recovery, and Module 7, Lesson 8's backpressure/circuit-breaker content into this lesson's deliberate, prioritized load-shedding policy. Depends on Lesson 2's SLO/error-budget content (adaptive load shedding is tied directly to burn rate) and Lesson 3's incident-response content (degradation flags are a prepared incident-response tool).

## 12. Practical exercise

For a system you've built, identify its single most likely bottleneck resource under load (using this lesson's capacity-planning questions), and design one concrete degradation flag that would let you shed load gracefully from a specific, non-critical feature under stress.

## 13. Challenge

Design Project 2's full disaster-recovery and capacity plan: RPO/RTO targets for the core ledger (Module 3, Lesson 10, extended here), a load-shedding policy prioritizing payment processing over lower-stakes features, and a concrete plan for how you'd actually test your stated RTO rather than merely asserting it.

## 14. Mastery test

- Distinguish fault tolerance from graceful degradation precisely, with a concrete mechanism exemplifying each.
- Explain why a degradation flag decided in advance is safer than an improvised fix during an active incident.
- Explain adaptive load shedding's connection to Lesson 2's SLO burn rate.
- Explain why an untested DR plan's RTO should be treated as unknown, connecting to Module 3, Lesson 10's original framing of this point.
