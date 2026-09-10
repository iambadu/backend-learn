# Deployment Strategies & CI/CD

## 1. Why does this exist?

Module 3, Lesson 8 taught the Expand-Contract pattern specifically because multiple application instances roll out gradually, not simultaneously, during a deploy — this lesson is the full treatment of exactly that gradual-rollout reality: the concrete strategies for actually shipping new code to production, each with different risk, cost, and rollback characteristics, and the CI/CD pipeline mechanics that make shipping safely a routine, repeatable, low-drama event rather than a nerve-wracking one.

## 2. Mental model

Deploying new code to a live, traffic-serving system is like replacing an aircraft's engine mid-flight — you cannot simply stop everything, swap it out, and restart, so every deployment strategy is really a different answer to "how do we do this gradually and safely enough that if something's wrong, we notice with minimal passengers affected, and can reverse course quickly."

## 3. Technical explanation

**Rolling deployment — the default, incremental approach:** new instances running the updated code are brought up gradually, replacing old instances one at a time (or in small batches), with the load balancer (Module 1, Lesson 8) shifting traffic away from old instances as new ones become healthy. This is low-resource-cost (you're not running two full parallel environments) and has straightforward rollback (stop the rollout, roll instances back to the old version) — but it has a real, specific consequence worth naming precisely: **for the duration of the rollout, old and new code versions are simultaneously serving live traffic**, which is exactly why Module 3, Lesson 8's Expand-Contract discipline is non-negotiable during a rolling deploy — any schema or API change that isn't backward/forward compatible across that mixed-version window will produce real, live errors for whichever requests happen to hit the "wrong" combination of old/new code and old/new schema during the transition.

**Blue-green deployment — near-zero-downtime via a full parallel environment:** two complete, identical production environments exist ("blue" — currently live, and "green" — the new version, fully deployed but not yet receiving traffic). Once the green environment is verified healthy, traffic is switched over **all at once** (a load-balancer or DNS-level cutover, Module 1, Lessons 4 and 8 directly) — genuinely near-zero downtime, and rollback is simply switching traffic back to blue, which is still fully intact and running. The real, honest cost: roughly double the infrastructure, since you're running two complete production-capacity environments simultaneously during the transition — a real, explicit trade-off worth stating in dollar terms, not just abstractly, since it's often the deciding factor in choosing this strategy or not.

**Canary deployment — the most cautious, most operationally sophisticated approach:** the new version is deployed to a small subset of production traffic (a specific percentage of requests, or a specific subset of users) while the vast majority continues on the stable, existing version — metrics are compared between the canary and the stable population, and if the canary looks healthy, traffic is gradually increased toward it; if it looks unhealthy, it's rolled back having affected only a small fraction of real traffic. This requires genuinely more sophisticated supporting infrastructure than the other two strategies: traffic-splitting capable of routing by percentage (not just all-or-nothing), and — critically — monitoring that can **segment metrics by version**, so you can actually tell whether the canary population's error rate or latency differs meaningfully from the stable population's, rather than just watching one aggregate number that blends both.

**Choosing between them — a real decision, not a strict hierarchy where canary is always "best":** rolling deployment fits smaller-scale systems where the mixed-version window is short and manageable, and infrastructure cost matters. Blue-green fits systems where downtime is genuinely unacceptable and the double-infrastructure cost is affordable. Canary fits mission-critical systems where the cost of a bad deploy affecting the *entire* user base at once is severe enough to justify the real, additional monitoring and traffic-splitting infrastructure canary requires — Project 2's payment platform is a genuinely strong candidate for canary specifically because a bad deploy affecting 100% of payment traffic instantly is a categorically worse outcome than affecting 5% while a canary is being evaluated.

**CI/CD — the pipeline that makes any of these deployment strategies routine and low-risk rather than a manual, error-prone, high-stakes event, worth understanding as a discipline, not just a set of tools:** **Continuous Integration (CI)** means every code change is automatically built, tested, and validated (Level 3's database-layer tests, Level 2's API contract tests, and others) on every commit or merge — the discipline this enables is catching integration problems (two developers' changes conflicting in ways neither noticed individually) immediately, rather than discovering them at deploy time when they're far more expensive and stressful to diagnose. **Continuous Deployment/Delivery (CD)** means a change that passes CI is automatically (deployment) or with a single manual approval gate (delivery) pushed through one of this lesson's deployment strategies into production — the entire point being that shipping becomes a small, frequent, low-risk, mostly-automated event rather than a large, infrequent, high-stakes, manually-orchestrated one. This directly connects to and enables the deployment strategies above: rolling, blue-green, and canary all assume an automated, repeatable pipeline actually performing the rollout mechanics — none of them are realistically executed safely by hand, repeatedly, without real automation behind them.

## 4. How it works internally

A canary deployment's traffic-splitting is typically implemented at the load-balancer or API-gateway layer (Module 8, Lesson 5) — weighted routing sends a configured percentage of requests to the canary instance pool versus the stable pool, and this weight is adjusted programmatically (often automatically, based on the canary's observed health metrics crossing predefined thresholds) as confidence in the canary grows, all orchestrated by the CI/CD pipeline rather than a human manually flipping a switch at each stage.

## 5. Example

```
Rolling:    [old][old][old][old] → [new][old][old][old] → [new][new][old][old] → ...
Blue-Green: blue (100% traffic) ←→ green (0% traffic, fully deployed) → instant cutover
Canary:     stable (95% traffic) + canary (5% traffic) → gradually shift weight toward canary
```

## 6. Code

```yaml
# A minimal CI pipeline stage, illustrating the discipline, not a specific tool's syntax:
on: [push]
jobs:
  ci:
    steps:
      - run: npm test                    # unit + integration tests
      - run: npm run test:contract       # API contract tests (Module 2's error/schema content)
      - run: docker build .              # Lesson 2's containerization
  cd:
    needs: ci
    steps:
      - run: deploy --strategy=canary --initial-weight=5%
```

## 7. Failure scenarios

- **A rolling deployment with a breaking schema change that violates Module 3, Lesson 8's Expand-Contract discipline** — real, live errors during the mixed-version window, exactly the failure mode that lesson's pattern exists to prevent.
- **A blue-green deployment cutover happening before the green environment's own dependencies (a database migration, Module 3, Lesson 8) are actually ready** — an instant, all-at-once switch to a broken environment, with no gradual warning the way a canary would have provided.
- **A canary deployment with metrics that aren't actually segmented by version** — the canary's problems get averaged into the overall metric with the much larger stable population, masking a real regression that would have been obvious if compared correctly.

## 8. Common misconceptions

- **"Canary is strictly better than rolling or blue-green, so it should always be used."** It requires genuinely more sophisticated supporting infrastructure (percentage-based traffic splitting, version-segmented monitoring) that's real, added complexity — appropriate specifically when the cost of an undetected bad deploy is severe enough to justify it, not universally.
- **"Blue-green deployment eliminates the need for backward-compatible schema changes."** The cutover itself is instant, but the deployment process leading up to it (database migrations, Module 3, Lesson 8) still needs to be compatible with whichever environment is currently live during the preparation phase — blue-green doesn't exempt you from that lesson's discipline, it just changes the shape of the transition window.
- **"CI/CD is just automation for convenience."** It's the actual, necessary infrastructure that makes any of this module's deployment strategies safe to execute repeatedly and frequently — without it, "rolling deployment" or "canary" are theoretical descriptions of a manual process too risky and slow to actually perform often.

## 9. Trade-offs

Rolling: cheapest, real mixed-version-window risk. Blue-green: near-zero downtime and instant rollback, double infrastructure cost. Canary: earliest, most contained detection of a bad deploy, real additional monitoring/traffic-splitting infrastructure cost and complexity.

## 10. Real-world applications

- Project 2's payment platform is a directly, concretely strong canary candidate given the severity of a bad deploy affecting all payment traffic at once.
- Every mature engineering organization's CI pipeline directly encodes this curriculum's own testing content (Module 2's contract testing, Module 3's database-layer correctness) as automated, mandatory gates before any deployment strategy even begins.

## 11. Connections

Directly depends on Module 3, Lesson 8's Expand-Contract pattern (the specific discipline needed to survive any strategy's mixed-version window) and Module 1, Lesson 8's load-balancer content (the actual mechanism traffic-splitting is implemented on). Sets up Level 10's observability content (canary's version-segmented monitoring is a direct, concrete instance of that module's dashboarding discipline).

## 12. Practical exercise

Design a CI/CD pipeline (as a diagram or pseudo-config) for a project you've built, specifying what automated checks must pass before deployment, and which of this lesson's three strategies you'd choose for it, justified against this lesson's specific trade-offs.

## 13. Challenge

For Project 2, design the full deployment strategy: which of rolling/blue-green/canary for the core payment API specifically (and justify whether a different, lower-risk strategy is acceptable for a less-critical internal admin tool sharing the same codebase), and specify what version-segmented metrics a canary rollout would need to watch before increasing traffic weight.

## 14. Mastery test

- Distinguish rolling, blue-green, and canary deployment by their specific risk, cost, and rollback characteristics.
- Explain why a rolling deployment's mixed-version window makes Module 3, Lesson 8's Expand-Contract pattern non-negotiable.
- Explain what "version-segmented metrics" means for canary deployments, and why aggregate metrics alone are insufficient.
- Explain the distinction between Continuous Integration and Continuous Deployment/Delivery precisely.
