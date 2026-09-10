# Threat Modeling — STRIDE, and Thinking Like an Attacker Before You Ship

## 1. Why does this exist?

Every lesson in this module so far taught a specific, named vulnerability class and its specific fix — a reactive, after-the-fact posture. Threat modeling is the proactive discipline this whole module has been building toward: systematically asking "what could go wrong here, before it's built," using STRIDE as a structured checklist so you're not relying on remembering every specific vulnerability class from memory under time pressure, the way this module's lessons might otherwise leave you.

## 2. Mental model

Threat modeling is walking through a building's blueprints *before construction begins*, asking a security expert to point at every door, window, and vent and ask "how would someone get in here who shouldn't, and what would they be able to do once inside" — catching design flaws when they're a five-minute conversation and a redrawn blueprint, rather than after the building exists and a break-in has already happened.

## 3. Technical explanation

**STRIDE — Microsoft's six-category threat-classification framework, applied against a system's data-flow diagram, worth knowing each category precisely since each maps directly to a security property being violated:**
- **Spoofing** — an attacker pretending to be someone or something they're not, violating **authentication**. Directly connects to Module 2, Lesson 3's authentication content and Lesson 3's password-hashing content — anywhere identity is claimed and verified is a spoofing surface.
- **Tampering** — unauthorized modification of data or system state, violating **integrity**. Module 2, Lesson 9's HMAC webhook-signature content is a direct, concrete tampering defense; Module 3, Lesson 8's database constraints are a tampering defense at the data layer.
- **Repudiation** — a party denying they performed an action, when your system has no way to prove otherwise, violating **non-repudiation**. Addressed by secure, tamper-evident audit logging (Module 10, Lesson 1's structured logging, extended here to specifically support "prove who did what, when," directly relevant to Project 2's financial audit-trail requirements).
- **Information Disclosure** — exposing data to a party who shouldn't see it, violating **confidentiality**. Directly connects to Lesson 3's encryption content and Module 2, Lesson 3's authorization content (IDOR, Module 2's own flagged example, is precisely an information-disclosure failure).
- **Denial of Service** — degrading or blocking legitimate access to a system, violating **availability**. Module 2, Lesson 6's rate limiting and Module 7, Lesson 8's backpressure/circuit-breaker content are direct DoS defenses.
- **Elevation of Privilege** — gaining capabilities beyond what was legitimately granted, violating **authorization boundaries**. Directly connects to Lesson 4's least-privilege content and Module 2, Lesson 3's authorization models — this is what happens when those boundaries are successfully broken through.

**Why STRIDE's value is specifically in its systematic *coverage*, not in teaching you anything new about any individual attack — worth stating precisely, since this reframes the whole lesson's purpose:** by this point in the curriculum, you already know the specific mechanics of injection, XSS, CSRF, SSRF, and weak authentication in real depth. STRIDE's actual contribution is a **checklist discipline** ensuring that when you sit down to design a new feature, you systematically ask all six questions against every significant data flow in that feature — rather than relying on remembering, under normal design-review time pressure, which specific vulnerability classes might apply to this particular feature's particular shape. This is precisely analogous to a pilot's pre-flight checklist: not because a pilot doesn't know how to check the fuel level, but because a systematic checklist catches what an unstructured, memory-dependent review reliably misses under real, everyday time pressure.

**Applying STRIDE concretely — the actual practice, not just the taxonomy, worth walking through as a real, worked method:** for a specific feature (say, Project 2's "register a webhook URL" feature from Module 2, Lesson 9 and Lesson 2's SSRF content), walk through each STRIDE category against its data flow: *Spoofing* — can an attacker register a webhook pretending to be a different, legitimate account? *Tampering* — can the registered URL be altered in transit or by another user? *Repudiation* — if a webhook is misused, is there an audit trail proving who registered it? *Information Disclosure* — does the webhook-delivery payload leak more data than the registering party is authorized to see? *Denial of Service* — can an attacker register enough webhooks, or trigger delivery frequently enough, to overwhelm your delivery infrastructure? *Elevation of Privilege* — can the webhook-registration feature itself be used to reach internal resources (exactly Lesson 2's SSRF content) beyond what the registering user should ever be able to touch? Each "yes" identifies a concrete threat requiring a specific, already-covered defense from earlier in this module — the systematic walkthrough is what ensures none of the six categories gets silently skipped for this specific feature.

**Data-flow diagrams — the concrete artifact threat modeling is actually performed against, worth naming since STRIDE without one becomes vague and unstructured:** a data-flow diagram identifies a system's **trust boundaries** (where data crosses from a less-trusted zone to a more-trusted one — a public internet request entering your API, a request crossing from your application into your database) — STRIDE is systematically applied at each boundary crossing specifically, since that's precisely where an attacker's untrusted input first meets your system's trusted logic, exactly the same trust-boundary framing Lesson 1's injection content and Module 2, Lesson 2's validation content already established, now given an explicit, drawn artifact to reason against rather than an implicit mental model.

## 4. How it works internally

A real, practical threat-modeling session for a new feature (before writing production code, ideally during design review) sketches the feature's data flow, marks every trust boundary crossing, and works through STRIDE's six questions at each one — the output is a concrete list of identified threats, each mapped to a specific mitigation (many of which you'll recognize directly from this module's earlier lessons), reviewed and signed off before implementation begins, exactly analogous to how Module 3, Lesson 8's Expand-Contract migration plan is reviewed and agreed *before* a risky schema change is executed, rather than improvised during it.

## 5. Example

```
Feature: "Import contacts from a URL" (Project 4)
Trust boundary: user-supplied URL → server fetch → parsed data stored

S: Can an attacker impersonate another org to trigger an import into
   the wrong tenant's data? → check tenant-scoped authorization.
T: Can the fetched data be tampered with in transit? → require HTTPS,
   validate the source, don't trust unauthenticated redirects.
R: Is there an audit log of who triggered which import? → structured
   logging (Module 10, Lesson 1) with the acting user's ID.
I: Does the imported data leak into another tenant's view? → Module 8
   Lesson 2's bounded-context/tenant-isolation discipline.
D: Can many large imports be triggered to exhaust resources? → rate
   limiting (Module 2, Lesson 6) and request-size limits.
E: Can the "fetch a URL" feature be used to reach internal resources?
   → Lesson 2's SSRF defenses, directly.
```

## 6. Code

```
# A minimal, reusable threat-model template, worth applying per
# significant feature before implementation:
Feature: ___
Trust boundaries crossed: ___
For each STRIDE category:
  - Applicable threat (if any): ___
  - Existing/planned mitigation: ___
  - Residual risk accepted (if any), and why: ___
```

## 7. Failure scenarios

- **Shipping a feature with an obvious, un-reviewed trust-boundary crossing** (exactly the webhook-URL example) that a five-minute STRIDE walkthrough would have caught before implementation, discovered instead in production via an actual incident.
- **A security review that checks for "the usual suspects" (SQL injection, XSS) but skips repudiation or denial-of-service entirely**, because there's no systematic checklist ensuring every category is actually considered — precisely the gap STRIDE's structured coverage exists to close.
- **Treating threat modeling as a one-time, pre-launch activity** rather than a recurring practice applied to every significant new feature — a system's threat surface changes every time meaningful new functionality is added, not just at initial launch.

## 8. Common misconceptions

- **"Threat modeling requires learning entirely new attack techniques."** By this point in the curriculum, you already know the specific mechanics this lesson's six categories map onto — STRIDE's value is systematic coverage and process discipline, not new technical content.
- **"STRIDE is only for large, formal enterprise security teams."** The lightweight version (a quick, structured walkthrough during design review, as shown in this lesson's example) is genuinely practical for a small team or even a solo developer — the discipline scales down perfectly well.
- **"A feature that passed threat modeling once is permanently safe."** New code paths, new integrations, and evolving attack techniques mean threat modeling is a recurring practice tied to ongoing feature development, not a one-time certification.

## 9. Trade-offs

Threat modeling: real, upfront time investment during design (a genuine cost, especially under deadline pressure), in exchange for catching design-level security flaws while they're still cheap to fix — precisely mirroring this curriculum's repeated point (Module 3, Lesson 8's migration discipline, Module 9, Lesson 3's deployment strategies) that catching a problem early, deliberately, is categorically cheaper than discovering it in production.

## 10. Real-world applications

- Every feature across this curriculum's five projects that crosses a genuine trust boundary (user input, an external API integration, a webhook, a file upload) is a legitimate, direct candidate for this lesson's STRIDE walkthrough before implementation — not a theoretical exercise reserved for large organizations.
- STRIDE, created at Microsoft, is genuinely, currently used across the security industry as a standard, practical framework — this lesson's content is directly, professionally applicable vocabulary and method, not academic theory.

## 11. Connections

Directly synthesizes every prior lesson in this module — each STRIDE category maps onto specific defenses already covered (Lesson 1's injection, Lesson 2's XSS/CSRF/SSRF, Lesson 3's encryption/hashing, Lesson 4's least privilege) — and gives them a systematic, repeatable process for actually being applied during design, rather than recalled ad hoc.

## 12. Practical exercise

Take a feature you've built or are designing for one of this curriculum's projects, draw its data-flow diagram identifying every trust boundary, and complete this lesson's STRIDE template for it — identifying at least one real, previously-unconsidered threat the systematic walkthrough surfaces.

## 13. Challenge

For Project 2's core payment-processing flow, conduct a full STRIDE threat model, mapping each identified threat to a specific defense from this module (or earlier modules), and explicitly document any residual risk you're deliberately accepting rather than mitigating, with your reasoning.

## 14. Mastery test

- Name all six STRIDE categories and the specific security property each one violates.
- Explain why STRIDE's actual value is systematic coverage rather than new technical knowledge, for someone who's completed this module.
- Given a described new feature (in conversation), conduct a STRIDE walkthrough identifying at least one threat per applicable category and its corresponding defense.
- Explain why threat modeling should be a recurring practice tied to feature development, not a one-time, pre-launch activity.
