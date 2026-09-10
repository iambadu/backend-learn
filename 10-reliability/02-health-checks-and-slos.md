# Health Checks, SLIs, SLOs & Error Budgets

## 1. Why does this exist?

Module 1, Lesson 8 already flagged that a shallow `/health` endpoint (checking only "is the process running") can keep an effectively broken backend in rotation — this lesson gives that problem its full treatment, and introduces the vocabulary (SLI/SLO/SLA, error budget) that turns "100% uptime is the goal" — a real, flagged misconception — into a precise, negotiable, genuinely useful engineering target instead of an impossible, unstated aspiration.

## 2. Mental model

"100% uptime" is a promise no real system can keep and shouldn't try to — every additional nine of reliability costs disproportionately more engineering effort than the last, and beyond some point, that effort is better spent building features than chasing an availability target nobody actually needs. An error budget reframes this honestly: instead of an unstated, unrealistic "never fail" expectation, you explicitly decide *how much* unreliability is acceptable, and once you've spent that allowance, the organization has a clear, pre-agreed signal to slow down and stabilize rather than an ongoing, ambiguous argument about whether reliability work matters right now.

## 3. Technical explanation

**Liveness vs. readiness — the specific, precise distinction Module 1, Lesson 8's "shallow health check" warning was gesturing at, now made exact:** a **liveness check** answers "is this process still running and not deadlocked" — if it fails, the orchestrator (Module 9, Lesson 5's Kubernetes content, directly) should restart the process, since a genuinely stuck process won't recover on its own. A **readiness check** answers a different, more specific question: "is this instance currently able to correctly serve traffic right now" — checking real, load-bearing dependencies (can it reach its database connection pool, Module 3 Lesson 9; is it still warming up after a deploy) — if readiness fails, the orchestrator should stop routing *new* traffic to this instance without necessarily restarting it, since the underlying process might be fine and the dependency might recover shortly. Conflating these two (using one shallow check for both purposes) is precisely the failure mode Module 1, Lesson 8 named: a process that's technically alive but genuinely unable to serve requests correctly (its database connection pool exhausted, say) stays in a load balancer's rotation, actively serving errors, because the check only ever verified liveness, never readiness.

**SLI (Service Level Indicator) — a precisely, quantitatively defined measurement of some aspect of your service's actual behavior, not a vague notion of "how well it's doing":** common SLIs are request latency (specifically, a percentile — Level 12 will insist on this over an average), error rate (the fraction of requests returning an error), and availability (the fraction of requests successfully served at all). The defining, load-bearing property of a good SLI: it must measure something users **actually experience**, not an internal implementation detail that merely correlates with user experience — directly connecting to this lesson's alerting-design content (Lesson 3): a symptom (elevated error rate, users' actual experience) is a better SLI foundation than a cause (a specific server's CPU usage, which might spike with zero user-visible consequence at all).

**SLO (Service Level Objective) — a target value for an SLI, the actual, internal reliability goal you're engineering toward:** "99.9% of requests succeed, measured over a rolling 28-day window" is a genuine SLO — precise, measurable, and time-bounded. **SLA (Service Level Agreement) — a genuinely different, external, contractual commitment, worth distinguishing precisely since the two are frequently conflated:** an SLA is what you've promised customers, typically with financial penalties for violation, and the correct, deliberate practice is setting your **internal SLO stricter than your external SLA** — giving yourself a real safety margin so that ordinary, expected reliability variance doesn't routinely breach a contractual, financially-penalized commitment.

**The error budget — the single most practically useful reframing this lesson provides, worth deriving precisely:** an error budget is simply `1 - SLO` — a 99.9% SLO implies a 0.1% error budget. For a service handling 3 million requests over a 4-week measurement window, a 0.1% error budget is a concrete, spendable allowance of 3,000 permitted errors over that window — not an abstract percentage, an actual, countable number the team can track against in real time. **This reframing does real, practical organizational work, worth stating precisely rather than treating as a nicety**: once the error budget for a period is spent, the pre-agreed, objective response is to halt risky changes (feature launches, aggressive experiments) and prioritize reliability work until the budget resets — turning what would otherwise be an ongoing, political, relationship-straining negotiation between "ship features faster" and "the system needs to be more reliable" into an objective, pre-agreed, depoliticized trigger. Just as importantly, and often underappreciated: **an error budget that's consistently *unspent* is itself a signal** — it means the team can likely afford to take on more risk (ship faster, run more experiments) than it currently is, which is a genuinely useful, positive signal error-budget tracking surfaces that a simple "avoid all errors" mindset never would.

**Why "100% uptime" is the wrong target, precisely, not just impractical — the roadmap's own flagged misconception, now fully grounded:** every additional nine of availability (99% → 99.9% → 99.99%) costs disproportionately more engineering effort than the previous one, for diminishing real-world benefit past the point where your actual users' needs are already met — a system serving an internal admin tool used during business hours has no genuine need for 99.99% availability, and chasing it anyway diverts real engineering effort from work that would matter more. The SLI/SLO framework replaces an unstated, unrealistic "never fail" default with an explicit, deliberate, cost-aware decision about how much reliability a specific service's actual context genuinely requires.

## 4. How it works internally

A Kubernetes Deployment (Module 9, Lesson 5) configured with both `livenessProbe` and `readinessProbe` uses this lesson's precise distinction directly and operationally: a failed liveness probe triggers a pod restart (the reconciliation loop correcting toward "this pod should be healthy"); a failed readiness probe removes the pod from a Service's routing set (Module 1, Lesson 8's load-balancer content, natively) without killing the pod, giving a genuinely-recovering dependency time to come back before traffic resumes.

## 5. Example

```
Liveness check:  GET /healthz → 200 if the process can respond at all
Readiness check: GET /readyz  → 200 only if DB pool has available connections
                                 AND cache connection is established
                                 AND startup migrations have completed
```

## 6. Code

```ts
@Get('readyz')
async readiness(@Res() res: Response) {
  const dbHealthy = await this.dbPool.query('SELECT 1').then(() => true).catch(() => false);
  const cacheHealthy = await this.redis.ping().then(() => true).catch(() => false);
  if (dbHealthy && cacheHealthy) return res.status(200).send('ready');
  return res.status(503).send('not ready'); // Module 1 Lesson 8's shallow-check problem, fixed
}
```

## 7. Failure scenarios

- **A shallow health check keeping a broken instance in rotation**, exactly Module 1, Lesson 8's flagged failure — actively serving errors to real users because the check never verified the dependencies actually needed to serve a request correctly.
- **A conflated liveness/readiness check**, causing an orchestrator to needlessly restart a process whose underlying code is fine but whose database dependency is briefly recovering — unnecessary churn, and potentially worse availability than simply waiting for readiness to recover.
- **No error budget tracking**, meaning reliability-vs-velocity trade-off decisions are made ad hoc, politically, and inconsistently, rather than against a pre-agreed, objective threshold.

## 8. Common misconceptions

- **"100% uptime is the correct target."** The roadmap's own flagged misconception — it's a target with disproportionate, often unjustified cost past the point of genuine user need, and the SLI/SLO/error-budget framework exists specifically to make that cost/benefit trade-off explicit rather than defaulting to an unstated, unrealistic ideal.
- **"SLO and SLA are the same thing."** SLA is an external, contractual, financially-penalized commitment; SLO is an internal engineering target, correctly set stricter than the SLA to provide a genuine safety margin.
- **"A health check that returns 200 means the service is genuinely healthy."** Only if it's actually checking readiness (real, load-bearing dependencies), not merely liveness (the process is running at all) — the two answer genuinely different questions.

## 9. Trade-offs

Stricter SLOs: higher user-experienced reliability, disproportionately higher engineering cost to maintain, especially past a certain point. Looser SLOs: lower engineering cost, real risk of user-visible unreliability if set carelessly rather than deliberately matched to actual user needs. The error budget makes this trade-off explicit and continuously trackable rather than a one-time, unrevisited decision.

## 10. Real-world applications

- Project 2's payment API almost certainly warrants a stricter SLO than, say, an internal reporting dashboard within the same system — this lesson's framework gives you the precise vocabulary to justify and track that differentiated reliability investment rather than applying one uniform standard everywhere.
- Google's SRE practice (the origin of this vocabulary) uses error-budget exhaustion as a literal, binding trigger halting feature launches until reliability work restores the budget — a real, documented, working organizational mechanism, not a theoretical framework.

## 11. Connections

Directly resolves Module 1, Lesson 8's shallow-health-check flag with the precise liveness/readiness distinction. Depends on Lesson 1's metrics content (an SLI is, precisely, a deliberately-chosen metric) and sets up Lesson 3 (alerting should be built on SLO burn-rate, not arbitrary thresholds).

## 12. Practical exercise

For a service you've built, define one real SLI (latency, error rate, or availability), set an SLO for it, and compute the resulting error budget in concrete, countable terms (not just a percentage) for a realistic request volume.

## 13. Challenge

For Project 2, define distinct SLOs for the payment-processing path versus a lower-stakes reporting/dashboard path within the same system, and justify the difference using this lesson's cost/benefit reasoning — including what each SLO's error budget looks like in concrete terms.

## 14. Mastery test

- Distinguish liveness and readiness checks precisely, and explain the specific failure mode conflating them produces.
- Define SLI, SLO, and SLA precisely enough to state why an SLO should be stricter than a corresponding SLA.
- Compute an error budget in concrete request counts given an SLO and a request volume, and explain what happens organizationally once it's exhausted.
- Explain precisely why 100% uptime is the wrong default target, using the diminishing-returns argument.
