# Alerting & Incident Response — Symptoms, Fatigue, and Blameless Postmortems

## 1. Why does this exist?

Lesson 1 gave you the data (logs, metrics, traces) and Lesson 2 gave you a precise reliability target (SLOs, error budgets) — this lesson is about the human-facing system that turns "the data shows a problem" into "the right person is looking at it, right now, without being buried under noise," and what happens after the fire is out, so the same incident doesn't recur. Both halves of this lesson matter for the same reason: a team that's paged constantly for non-issues stops trusting alerts, and a team that doesn't systematically learn from incidents keeps re-discovering the same failure modes.

## 2. Mental model

Alert fatigue is a smoke detector that goes off every time you make toast — technically correct that smoke is present, but so frequent and low-value that you eventually just remove the battery, at which point it can't warn you about a real fire either. Good alerting design is a smoke detector tuned to distinguish "toast" from "actual fire" — alerting on the thing that genuinely matters (are people hurt, is the house burning) rather than every intermediate signal that merely correlates with danger.

## 3. Technical explanation

**Symptom-based vs. cause-based alerting — the single most consequential alert-design distinction, worth stating precisely since getting it backwards is the primary driver of alert fatigue:** a **cause-based** alert fires on an internal signal that *might* indicate a problem — "CPU usage exceeded 90%," "a specific server's disk is 80% full." The real, well-documented issue: a service running at 95% CPU might be perfectly healthy if user-facing latency and error rate remain entirely normal — cause-based alerts fire on internal state regardless of whether that state is actually producing any user-visible harm, which is precisely why they're the dominant source of alert fatigue. A **symptom-based** alert fires on Lesson 2's SLIs directly — elevated error rate, elevated latency percentile, degraded availability — measuring what users **actually experience**, regardless of which specific internal cause is responsible. The documented, practical guidance: **symptom-based alerts should page a human** (they represent genuine, current user impact demanding immediate attention); **cause-based signals are valuable for investigation** (once paged by a symptom, cause-based data — that CPU chart, that disk-usage graph — helps you diagnose *why*, cutting a documented 10-35 minutes off investigation time by pointing directly at a likely culprit) but generally **shouldn't independently trigger a page on their own**, since they're a poor, noisy proxy for "does this actually matter right now."

**The "for" duration — a small, concrete, high-leverage technique worth naming specifically, since it directly prevents a real, common category of noise:** an alert condition should typically only fire if it persists for a specified duration ("error rate above threshold for 5 minutes," not "error rate above threshold for even one data point") — this single, simple discipline prevents transient, self-resolving blips (a brief GC pause, Module 7, Lesson 5's process-pause content; a momentary network hiccup, Module 1's content) from paging someone for a problem that's already gone by the time they'd look at it, a real, common, avoidable source of exactly the fatigue this lesson is about preventing.

**Burn-rate alerting — the direct, precise connection between Lesson 2's error budget and this lesson's alerting practice, worth deriving explicitly rather than treating the two lessons as separate:** rather than alerting on a raw threshold ("error rate above 1%"), a burn-rate alert asks "at the current rate of errors, how quickly are we consuming our error budget" — a service burning through its entire 28-day error budget in the next 2 hours at the current rate is a genuinely urgent, page-worthy event, even if the instantaneous error rate itself looks moderate; a service burning its budget slowly, on pace to exhaust it only near the end of the measurement window, might warrant a lower-urgency notification rather than an immediate page. This directly operationalizes Lesson 2's error budget as a *live, actionable alerting signal*, not merely a retrospective, end-of-period accounting exercise.

**Blameless postmortems — the discipline that turns an incident into organizational learning rather than merely a fire that got put out:** a postmortem, conducted after an incident, documents a timeline of what happened, its impact, how it was detected and resolved, and a root-cause analysis — with a specific, deliberate, non-negotiable cultural stance: **it assumes every person involved acted reasonably given the information they had at the time**, and stays focused on **how** the system allowed the failure to happen (a process gap, a missing safeguard, an alert that didn't fire), not **who** made a specific mistake. This is not a soft, feel-good add-on — it's a real, practical mechanism: when people expect blame for honest mistakes, they become risk-averse and, more damagingly, start hiding or downplaying details that would actually help prevent recurrence — a blameless process is specifically what makes honest, complete incident data available to learn from, and its absence is a direct, mechanical cause of *worse* future reliability, not merely a matter of team morale.

## 4. How it works internally

An alerting pipeline built on Lesson 1's metrics evaluates an SLO's burn rate continuously (comparing current error/latency trends against the error budget's remaining allowance and the time left in its measurement window), and routes an alert to a paging system only once a symptom-based, duration-gated, burn-rate-significant threshold is crossed — cause-based signals (CPU, memory, disk) are typically routed to dashboards and included in the alert's contextual payload for investigation, rather than independently triggering their own page.

## 5. Example

```
Symptom-based, burn-rate alert (PAGES a human):
  "payment-api error rate would exhaust its 28-day error budget within
   4 hours at the current rate" — clear, urgent, user-impact-grounded.

Cause-based signal (dashboard only, NOT a page):
  "payment-api instance-3 CPU at 92%" — might be fine, might be the
  cause of the above — investigate it as CONTEXT once paged, not as
  an independent trigger.
```

## 6. Code

```
# A duration-gated, symptom-based alert rule, illustrative:
alert: PaymentAPIHighErrorRate
expr: error_rate{service="payment-api"} > 0.01
for: 5m                      # prevents paging on a transient blip
severity: page
annotations:
  runbook: "https://.../payment-api-error-runbook"
```

## 7. Failure scenarios

- **A team drowning in cause-based alerts** (CPU, memory, disk thresholds independently paging), leading to real, documented alert fatigue — critical, genuinely urgent alerts get lost in the noise of dozens of low-value ones, exactly the smoke-detector-and-toast failure mode this lesson opened with.
- **An incident resolved with no postmortem, or a postmortem that assigns blame** — the same failure class recurs later, because the actual, systemic root cause was never honestly examined (blame-avoidance suppressed the details that would have revealed it) or never examined at all.
- **An alert with no "for" duration**, paging someone for a transient, already-self-resolved blip — real, avoidable fatigue directly caused by skipping this lesson's small, specific technique.

## 8. Common misconceptions

- **"More alerts mean better coverage."** Past a certain point, more alerts mean more noise and worse signal — the roadmap's own implicit point about symptom-vs-cause alerting design directly counters the instinct to alert on everything measurable.
- **"A blameless postmortem means nobody made mistakes."** It explicitly does not — it means treating mistakes as evidence the *system* allowed failure, and improving that system, rather than treating mistakes as an individual's personal failing to be punished.
- **"Cause-based signals are useless."** They're genuinely valuable for fast investigation once paged by a symptom — the point isn't that they're worthless, it's that they're a poor independent *trigger* for paging a human.

## 9. Trade-offs

Symptom-based alerting: fewer, higher-signal pages, real risk of slower root-cause identification without cause-based context readily available alongside the page. Cause-based alerting alone: fast to set up on raw infrastructure metrics, real, well-documented fatigue risk from firing on internal state that doesn't always translate to user harm. The correct practice combines both — symptoms trigger pages, causes aid investigation.

## 10. Real-world applications

- Project 2's payment API needs symptom-based, burn-rate alerting on its SLO (Lesson 2) as its primary paging mechanism, with cause-based dashboards (CPU, connection-pool saturation — Module 3, Lesson 9) available for fast investigation once paged, not as independent triggers.
- Blameless postmortems are standard, documented practice at essentially every mature engineering organization (Google's SRE practice, and broadly across the industry) — this isn't a niche technique, it's baseline professional practice you'll be expected to participate in.

## 11. Connections

Directly depends on Lesson 1 (metrics are what alerts are built on) and Lesson 2 (burn-rate alerting is error budgets made into a live, actionable signal). Feeds Level 11's incident-adjacent security-response content and Level 12's performance-investigation workflow.

## 12. Practical exercise

For a service you've built, design one symptom-based, burn-rate alert (using Lesson 2's SLO content) and one cause-based dashboard panel that would aid investigation once that alert fires — and write the "for" duration you'd choose, with a justification.

## 13. Challenge

Write a blameless postmortem template for Project 2's payment API, and role-play (in conversation) drafting one for a hypothetical incident (a bad deploy causing a 20-minute elevated error rate) — practicing the discipline of documenting the systemic cause without assigning individual blame.

## 14. Mastery test

- Distinguish symptom-based and cause-based alerts precisely, and explain why symptom-based alerts should generally be what pages a human.
- Explain the "for" duration technique and the specific failure mode it prevents.
- Explain burn-rate alerting's direct connection to Lesson 2's error budget concept.
- Explain why a blameless postmortem process is a mechanical necessity for genuine organizational learning, not merely a cultural nicety.
