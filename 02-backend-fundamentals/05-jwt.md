# JWT — Structure, Real Vulnerabilities, and the Revocation Problem

## 1. Why does this exist?

JWTs are probably the single most-used authentication mechanism you've already touched without necessarily having examined closely — and they're also one of the most commonly *misimplemented* pieces of backend infrastructure in the industry, specifically because their failure modes are subtle and library-dependent rather than obvious. This lesson exists to replace "JWTs are a secure way to do stateless auth" (true only when implemented correctly, and there's a well-documented history of it not being) with the specific mechanics of what can go wrong and why.

## 2. Mental model

A JWT is a tamper-evident, self-contained claim — like a sealed, signed letter of reference someone carries with them, rather than a coat-check ticket (Lesson 4's session model) that only means something when you look it up in a central ledger. Anyone can read the letter's contents (it's not encrypted, just signed), but nobody can alter its contents without invalidating the seal — *provided the person checking the seal actually verifies it correctly*, which turns out to be a real, historically exploited gap between what JWTs promise and how they're often actually checked.

## 3. Simple explanation

A JWT (JSON Web Token) is three base64url-encoded, dot-separated segments: `header.payload.signature`. The **header** declares metadata, critically including the signing algorithm (`alg`). The **payload** carries **claims** — arbitrary key/value data, including standard ones like `sub` (subject/user ID), `exp` (expiry timestamp), `iat` (issued-at). The **signature** is computed over the header and payload using a server-held secret or private key, and lets a verifier confirm the token wasn't tampered with since issuance — *if and only if* the verifier's signature-checking code is implemented correctly.

## 4. Technical explanation

**JWTs are signed, not encrypted, by default — and this is a specific, common misunderstanding with real consequences.** The payload is merely base64url-*encoded*, not encrypted — anyone who intercepts a JWT (or anyone with browser DevTools, since it's typically stored client-side) can trivially decode and read every claim in it. The signature only protects against **tampering**, not **disclosure**. **Never put a secret (a password, a raw payment credential) in a JWT's payload** — this is a real, recurring mistake, not a hypothetical one. (JWE — JSON Web Encryption — is a separate, less commonly used standard for actually encrypting claims, distinct from the signed-JWT/JWS pattern almost everyone means by "JWT" in practice.)

**RFC 8725 ("JSON Web Token Best Current Practices") exists precisely because JWT's *flexibility* — the `alg` header being attacker-controlled input that naive verification code trusted — produced a documented, exploited class of real-world vulnerabilities:**

- **The "none" algorithm attack**: the JWT spec defines `"alg": "none"` as a legitimate (if rarely useful) value meaning "unsigned." Some early/naive verification libraries, upon seeing `alg: none` in an attacker-modified token, would skip signature verification entirely and simply trust the payload — meaning an attacker could take any JWT, strip the signature, set `alg` to `none`, arbitrarily edit the payload (e.g., change their `role` claim to `admin`), and have it accepted as valid. The fix, now standard: **never let the token itself dictate which algorithm is acceptable** — the verifier must be configured with an explicit, fixed allow-list of acceptable algorithms and reject anything else outright, regardless of what the token's own header claims.
- **Algorithm confusion (RS256/HS256 substitution attack)**: a more subtle version of the same root cause. Many systems use `RS256` (RSA — asymmetric: a private key signs, the corresponding *public* key verifies) precisely so that multiple services can verify tokens using only the public key, without ever holding the signing secret. `HS256` (HMAC — symmetric: the *same* secret both signs and verifies) is different in kind. If a verifier naively picks its verification algorithm based on the incoming token's own `alg` header rather than enforcing a fixed expectation, an attacker can take a legitimately RS256-signed token, change `alg` to `HS256`, and **sign the modified token using the RS256 public key as if it were an HMAC secret** (the public key is, after all, publicly known — that's the whole point of asymmetric crypto) — and a verifier that blindly follows the header's `alg` field into an HMAC-verification code path, using that same public key as the "HMAC secret," will accept the forged, attacker-controlled token as validly signed. This is a genuinely subtle bug that has appeared in real, popular JWT libraries historically, not a contrived textbook example.
- **RFC 8725's core mitigations, stated as concrete implementation rules**: (1) the verifying application, not the token, decides which algorithm(s) are acceptable — configure an explicit allow-list and never branch verification logic based on the untrusted `alg` header value; (2) bind each key to exactly one specific algorithm and enforce that binding at verification time, not just by convention/documentation; (3) where a specific token type is at risk of being confused with another (e.g., an access token accepted where an ID token was expected), include and check an explicit type claim to disambiguate, rather than relying on structural similarity alone.

**The revocation problem — the single biggest practical limitation of JWTs, and why it's structural, not a bug:** because a JWT's validity is determined purely by signature verification and the `exp` claim, a server has no built-in way to say "this specific token, though not yet expired, should stop working right now" — unlike Lesson 4's Redis-backed session, where deletion is instant and total. The standard workarounds, each with a real cost:
- **Short-lived access tokens (commonly 5–15 minutes) paired with a separate, revocable refresh token** — limits the *maximum* damage window of a compromised or "revoked" token to its short remaining lifetime, at the cost of more frequent token-refresh round trips.
- **A server-side blacklist/denylist of revoked-but-not-yet-expired token IDs (`jti` claim), checked on every request** — this directly reintroduces the per-request state lookup JWTs were originally chosen to avoid, meaning at that point you're paying JWT's disadvantages (no built-in revocation without extra work) *and* re-adding the state-lookup cost sessions already had, unless the check is cheap enough (e.g., a fast Redis `EXISTS` check) to be a reasonable trade.
- **Practical consequence, tying back to Lesson 4**: this is exactly why the hybrid pattern (Redis-backed sessions at the browser edge, where instant revocation genuinely matters — a stolen laptop, a fired employee — and short-lived JWTs for internal service-to-service calls, where revocation urgency is lower and per-call verification speed matters more) is the pragmatic default, rather than treating "JWT vs. session" as a single, system-wide binary choice.

## 5. How it works internally

A verifying server, given a JWT, must: (1) parse header and payload (safe — no trust implied yet), (2) look up the expected verification key/secret for the token's issuer *based on the server's own configuration, never based on the token's own `alg`/`kid` header alone without cross-checking against an allow-list*, (3) recompute the signature over the received header+payload using that key and the *server-mandated* algorithm, (4) compare it byte-for-byte against the token's actual signature, and (5) only if that matches, check `exp`/`nbf` and any other claims. Steps 2 and 3, done wrong (trusting the token's own header to pick the algorithm/key), are exactly where the RFC 8725 vulnerability class above lives.

## 6. Example

```
echo '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=' 
# followed by a payload of your choosing and an empty signature segment —
# this constructs a syntactically valid "none"-algorithm JWT. A correctly
# configured verifier (fixed algorithm allow-list) rejects it outright;
# a naive one that trusts the header would not.
```
This is worth constructing once by hand, specifically to see that the attack requires no cryptographic breakthrough at all — only a verifier that trusts attacker-controlled input it shouldn't.

## 7. Code

```ts
import { verify } from 'jsonwebtoken';

// SAFE: algorithm is explicitly, server-side fixed — the token's own
// `alg` header is never consulted to decide how verification proceeds.
const payload = verify(token, publicKey, { algorithms: ['RS256'] });

// UNSAFE (illustrative — do not do this): omitting `algorithms` lets
// some library versions/configurations infer the algorithm from the
// token itself, reopening exactly the RFC 8725 vulnerability class above.
```

## 8. Failure scenarios

- **The "none" algorithm and RS256/HS256 confusion attacks**, as detailed above — both are library-misconfiguration bugs, not cryptographic breaks, and both have appeared in real production incidents historically.
- **A stolen long-lived JWT with no revocation path remaining fully valid for its entire, generously long `exp` window** — the direct, practical cost of skipping the short-token/refresh-token pattern for convenience.
- **Storing a JWT in `localStorage`** (accessible to any JavaScript running on the page, including injected XSS payloads — Lesson 4's `HttpOnly` cookie protection has no equivalent here) rather than an `HttpOnly` cookie — a genuinely common, genuinely risky pattern that trades XSS exposure for client-side convenience.

## 9. Common misconceptions

- **"JWTs are encrypted, so it's fine to put sensitive data in the payload."** They're signed, not encrypted, by default — payload contents are trivially readable by anyone holding the token.
- **"JWTs are inherently more secure than sessions."** They're a different trade-off, not a strict security upgrade — sessions have trivial revocation and no algorithm-confusion attack surface; JWTs avoid a per-request store lookup and forfeit trivial revocation. Security depends entirely on correct implementation of *either* approach.
- **"Using a well-known JWT library means I'm automatically protected from these attacks."** Correctly protects you only if you *use* the library's algorithm-allow-list feature explicitly — the vulnerability historically came from applications (and some library defaults) *not* constraining acceptable algorithms, not from the JWT format being inherently broken.

## 10. Trade-offs

JWTs: no per-request store lookup, natural fit for stateless verification across many independent services holding only a public key — at the cost of structural revocation difficulty and a documented history of algorithm-confusion implementation risk that must be actively defended against, not assumed away. Sessions (Lesson 4): trivial revocation, simpler security model — at the cost of a per-request store dependency.

## 11. Real-world applications

- OIDC's ID token (Lesson 3) *is* a JWT — everything in this lesson applies directly to verifying "who is this user" claims from an identity provider, making this lesson a direct prerequisite for implementing OIDC-based login correctly.
- API gateways commonly verify JWTs at the edge (using only a public key, no database call) specifically to avoid the Lesson-4-style store-lookup cost at very high request volumes — the internal-service half of the hybrid pattern.

## 12. Connections

Depends on Lesson 3 (OIDC's ID token is a JWT) and Lesson 4 (the session/JWT trade-off is best understood as a direct comparison, not JWT studied in isolation). Feeds directly into Level 11 (Security) — the algorithm-confusion class here is a concrete instance of a broader "never trust attacker-controlled input to decide how you validate that same input" principle that recurs throughout that module.

## 13. Practical exercise

Using the `jsonwebtoken` library (or your language's equivalent), write verification code two ways: once correctly (explicit `algorithms` allow-list) and once vulnerably (no allow-list specified, or accepting whatever the token's `alg` header states). Construct a `none`-algorithm token by hand and confirm it's rejected by the first and accepted by the second.

## 14. Challenge

Design the token strategy for Project 2 (the simulated payment platform): what goes in an access token's claims, what its lifetime should be, how refresh works, and what your revocation story is for a scenario where a payment API key is discovered to be compromised and must stop working *immediately*, not at next expiry.

## 15. Mastery test

- Explain precisely why JWTs being "signed, not encrypted" matters for what you're allowed to put in the payload.
- Walk through the RS256/HS256 algorithm-confusion attack step by step, explaining exactly what a vulnerable verifier does wrong and what the correct implementation does differently.
- Explain why JWT revocation is a structural problem rather than an implementation oversight, and evaluate the three standard workarounds' trade-offs against each other.
- Given a described production incident (a JWT-based system was found accepting `alg: none` tokens), identify the root cause and the specific one-line fix.
