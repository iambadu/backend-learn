# API Security & Least Privilege

## 1. Why does this exist?

This lesson pulls together threads deliberately left separate across the curriculum — Module 2, Lesson 6's rate limiting, Module 2, Lesson 3's OAuth scopes, Lesson 3's secrets rotation — into one coherent, explicit security posture for an API surface specifically, and gives "least privilege" its own precise, general treatment as the single organizing principle underlying nearly every specific defense in this module.

## 2. Mental model

Least privilege is giving every key in a building access to exactly the rooms that specific person's job requires, and nothing more — not because you distrust them, but because the *cost* of a compromised key (a lost badge, a coerced employee, a phished credential) is bounded by exactly what that key can open, and no further. Every specific technique in this lesson — API key scopes, rate limiting, network segmentation — is a different, concrete implementation of that identical, underlying principle.

## 3. Technical explanation

**API key scopes — least privilege applied directly to programmatic access, extending Module 2, Lesson 3's OAuth-scope content to the API-key case specifically:** an API key (or an OAuth access token, per Module 2 Lesson 3) should carry the **narrowest set of permissions** the specific integration actually needs — a third-party analytics integration reading order data should hold a read-only, orders-scoped key, never a key with write access to payments, even if the same API key management system could technically issue one broader key covering everything. The direct, quantifiable payoff, worth stating precisely rather than abstractly: if that narrowly-scoped key leaks (Lesson 3's secrets-exposure content), the actual damage is bounded to what it could ever do — read orders — rather than the full blast radius a broad, unscoped key would have permitted.

**Rate limiting as a security control, not merely a performance one — a genuinely important reframing worth stating explicitly, since Module 2, Lesson 6 introduced rate limiting purely through a capacity-management lens:** rate limiting is also a direct, load-bearing defense against **credential stuffing** (an attacker testing a large list of leaked username/password pairs against your login endpoint, hoping some fraction were reused from a different, previously-breached service) and **brute-force attacks** (systematically guessing a specific account's password). Module 2, Lesson 6's algorithms (token bucket, GCRA) apply identically here — the only genuinely new content is the *purpose*: a login endpoint's rate limit should be tuned specifically around this threat model (a low, aggressive limit per account and per source IP, since a legitimate user rarely attempts more than a handful of login tries in quick succession) rather than around the general capacity-management reasoning Module 2, Lesson 6 focused on for typical API traffic.

**API versioning and deprecation as a security-relevant discipline, not merely Module 2, Lesson 1's compatibility concern — worth naming this connection explicitly:** an old, unmaintained API version (Module 2, Lesson 1's versioning content) that's never actually decommissioned is a real, growing attack surface — every additional live version is additional code that must be kept patched against newly-discovered vulnerabilities, and an old version quietly left running past its intended lifecycle is exactly the kind of "security misconfiguration" (OWASP's current #2 category, Lesson 1) that accumulates silently in systems without a deliberate, enforced deprecation policy.

**Least privilege applied to infrastructure and network access — extending the principle beyond API keys to the broader system, worth naming specific, concrete instances rather than treating it as an abstract slogan:** a service should only be able to reach the specific downstream dependencies it genuinely needs (network segmentation limiting a public-facing web service from directly reaching an internal admin database it has no business touching), a deployed process should run with the minimum OS-level permissions its actual work requires (Lesson 1's file-permission content, Module 9, Lesson 1, applied at the process level — never running an application process as `root` when it doesn't need root-level access), and a database user/role used by an application should hold only the specific table/operation permissions that application genuinely performs (a read-only reporting service's database credentials should structurally be unable to issue a `DELETE`, even if a bug in its own application code somehow attempted one — a real, concrete defense-in-depth layer independent of and complementary to the application code's own correctness).

**Why least privilege is specifically valuable as a *defense-in-depth* principle, worth stating the precise reasoning rather than treating it as an isolated best practice:** no single defense in this entire module is perfect — code will have bugs, credentials will occasionally leak, a dependency will have an undiscovered vulnerability (Lesson 1's supply-chain content). Least privilege's actual value is bounding the *consequence* of any single defense failing, rather than preventing every failure outright — this is precisely why it's described as "defense in depth": even when one layer fails (a leaked API key, a SQL injection bug that somehow slips past Lesson 1's defenses), a correctly-scoped, least-privilege system limits how much damage that single failure can actually cause, rather than that one failure cascading into total compromise.

## 4. How it works internally

An API gateway (Module 8, Lesson 5) enforcing per-key rate limits and scope checks at the edge is applying this lesson's principles at exactly the architectural chokepoint that lesson identified as the right place for centralized, consistently-enforced security policy — a key's scope is checked once, centrally, rather than trusting every individual backend service to independently and consistently re-implement the same scoping logic correctly.

## 5. Example

```
API key: sk_live_analytics_readonly_a1b2c3
Scopes: [orders:read]
  → a request attempting orders:write, or payments:read, is
    rejected by the gateway BEFORE it ever reaches a backend
    service — the key structurally cannot do more than this,
    regardless of what any individual backend's own code does.
```

## 6. Code

```sql
-- Database-level least privilege: a reporting service's role
-- structurally cannot issue destructive operations, independent
-- of whatever the application code above it might attempt:
CREATE ROLE reporting_service WITH LOGIN PASSWORD '...';
GRANT SELECT ON orders, customers TO reporting_service;
-- no INSERT, UPDATE, DELETE granted — a bug in the reporting
-- service's own code cannot corrupt data, structurally, not
-- merely "because the code is trusted to behave."
```

## 7. Failure scenarios

- **A single, broadly-scoped API key used across every integration** for convenience — one leaked key (Lesson 3's exposure content) grants an attacker the full breadth of access every legitimate integration collectively needed, rather than being bounded to one integration's specific, narrow purpose.
- **No rate limiting on a login endpoint specifically**, or a rate limit tuned only for general capacity concerns rather than credential-stuffing resistance — a real, common, avoidable account-takeover vector.
- **An application's database credentials granted full read/write/delete access** "to keep things simple," meaning a SQL injection bug (Lesson 1) or an application-logic error can cause damage far beyond what that specific service's actual, legitimate function ever required.

## 8. Common misconceptions

- **"Least privilege is primarily about preventing attacks."** Its actual, primary value is *bounding the consequence* of a defense that's already failed — a subtle but important reframing, since it's a defense-in-depth principle, not a first-line-of-defense one.
- **"Scoping API keys narrowly is excessive caution for internal integrations we trust."** The value isn't about distrusting the integration's *intent* — it's about bounding the damage if that integration's credential is ever compromised through a channel entirely unrelated to the integration's own trustworthiness (a leaked secret, a compromised dependency).
- **"Rate limiting a login endpoint is only about preventing server overload."** It's a direct, primary defense against credential stuffing and brute-force attacks — a genuinely different, security-first motivation from Module 2, Lesson 6's general capacity-management framing.

## 9. Trade-offs

Fine-grained API scoping and database-role permissioning: real, ongoing administrative overhead (managing many narrow scopes/roles instead of one broad one) in exchange for a genuinely bounded blast radius when — not if — some individual defense eventually fails. This overhead is almost always worth paying for anything handling real, consequential data (Project 2's entire domain).

## 10. Real-world applications

- Project 2's integration with an external payment provider is a direct, concrete case for narrowly-scoped credentials — your application's key to the payment provider should hold only the specific permissions your actual integration needs, and vice versa for any key the payment provider issues to you.
- Database roles scoped per-service (rather than one shared, broadly-privileged application database user) is standard, expected practice in any mature production system, directly implementing this lesson's SQL example.

## 11. Connections

Directly extends Module 2, Lessons 3 and 6 (OAuth scopes and rate limiting, both reframed here with a security-first lens) and Module 9, Lesson 1 (file/process permission least-privilege, generalized here to the whole system). Sets up Lesson 5 (threat modeling identifies exactly where least-privilege boundaries need to be drawn).

## 12. Practical exercise

Audit an API you've built: for every issued credential (API keys, database users, service accounts), determine whether it's scoped to the minimum access its actual function requires, or broader "for convenience" — and narrow at least one down using this lesson's reasoning.

## 13. Challenge

Design Project 2's complete least-privilege matrix: every service, every credential it holds, and the minimum specific scope/permission each one genuinely needs — explicitly identifying and justifying any case where a broader scope is a deliberate, accepted trade-off rather than an oversight.

## 14. Mastery test

- Explain least privilege's actual value precisely — is it primarily a prevention mechanism or a consequence-bounding one, and why does that distinction matter?
- Explain why rate limiting a login endpoint is a security control, not merely a capacity-management one, and how the appropriate threshold differs from a general API rate limit.
- Design a database role's permission grant for a described service (in conversation) using strict least privilege, and justify every permission included and excluded.
