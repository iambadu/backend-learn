# Secrets, Encryption & Hashing — Why "Hash and Encrypt Are Interchangeable" Is Dangerously Wrong

## 1. Why does this exist?

Module 1, Lesson 6's TLS content covered encryption *in transit*; this lesson covers encryption and hashing as *data-at-rest* and *credential-storage* concerns, plus the operational discipline (secrets management) that keeps the keys and credentials protecting all of it from leaking in the first place. The roadmap's flagged misconception — "hashing and encryption are interchangeable" — is worth taking seriously as a real, common, consequential confusion, not a pedantic distinction.

## 2. Mental model

Encryption is a locked box with a key — reversible, by design, for anyone holding the right key. Hashing is running something through a paper shredder — deliberately irreversible, producing a fixed-size fingerprint you can compare against but never reconstruct the original from. You encrypt something you need to read again later; you hash something you only ever need to *verify*, never actually retrieve.

## 3. Technical explanation

**Why hashing and encryption are fundamentally different operations, not two flavors of the same thing — the precise distinction underlying the roadmap's flagged misconception:** encryption is a **reversible** transformation — given the ciphertext and the correct key, you recover the original plaintext exactly; this is what you want for data you'll need to read again (a stored credit card number, an encrypted database column). Hashing is a **one-way** transformation — given a hash output, there's no key or procedure that reconstructs the original input; this is precisely, deliberately what you want for a password, because your system should **never** need to recover a user's actual password — it only ever needs to verify that a login attempt's password, when hashed, matches the stored hash. Using encryption for password storage (reversible, by definition) means anyone who obtains both the ciphertext and the key can recover every user's actual plaintext password — a strictly worse outcome than a properly-hashed password, which reveals nothing reversible even to someone with full database access.

**Password hashing specifically requires a *slow*, deliberately expensive algorithm — not a general-purpose fast hash, and the concrete, quantified reason why:** a general-purpose cryptographic hash (SHA-256, designed for speed and integrity-checking, not password storage) is *too fast* for this specific job — a documented, concrete benchmark: a single consumer-grade GPU can compute roughly 22 billion SHA-256 hashes per second, meaning an entire common password wordlist (the well-known `rockyou.txt`, over 14 million entries) can be tested against a stolen SHA-256 hash in **under one millisecond**. Purpose-built password-hashing algorithms (bcrypt, Argon2, scrypt) are deliberately, tunably **slow** — the same GPU attacking bcrypt at a reasonable cost factor manages roughly 200 hashes per second, a documented **10-million-times** slowdown relative to SHA-256 — turning an offline brute-force attack from "complete in milliseconds" into "computationally infeasible at scale." The cost to a legitimate user (a 200-500ms delay on login) is imperceptible; the cost to an attacker attempting millions of guesses is what actually matters, and this asymmetry is the entire design point.

**Salting — the specific, necessary complement to slow hashing, worth understanding precisely rather than treating as a synonym for "add some randomness":** a **salt** is a random value unique to each password, combined with the password before hashing, ensuring that two users with the identical password produce entirely different stored hashes. Without a unique salt, an attacker can precompute a **rainbow table** (a massive, reusable lookup table of common password hashes) once, and use it against every stolen password database ever obtained — a salt defeats this precomputation entirely, since the attacker would need a separate rainbow table per unique salt value, which is computationally equivalent to just brute-forcing each password individually. Modern password-hashing libraries (bcrypt, Argon2) generate and manage a unique salt automatically as part of their standard API — this is worth knowing precisely because it means correctly using these libraries already gets you salting for free, without needing to implement it separately or reason about salt storage/management yourself.

**Argon2 vs. bcrypt — the current, specific, practical recommendation, worth stating precisely rather than leaving as "use a good password hash":** Argon2id (the balanced, recommended variant of Argon2) is the current strongest choice by contemporary cryptographic understanding, specifically because it's **memory-hard** — it deliberately requires significant memory, not just CPU time, to compute, which meaningfully resists the kind of massively-parallel, GPU/ASIC-accelerated attacks that plain CPU-time-hard algorithms remain more vulnerable to. bcrypt remains a **safe, legacy-compatible choice** — genuinely secure when properly tuned (an appropriately high cost factor) — but lacks Argon2's memory-hardness and has a more limited range of tunable cost, making it the reasonable-but-not-optimal choice when starting a new system without a specific compatibility constraint pointing toward it.

**Secrets management — the operational discipline protecting the keys and credentials that make all of the above meaningful, worth its own precise treatment rather than "keep secrets in environment variables and hope":** a dedicated secrets-management system (HashiCorp Vault, or a cloud provider's managed equivalent — AWS/GCP/Azure Secrets Manager) should be **the single place a production secret is created, updated, or revoked**, with every other location (an application's runtime memory, a deploy pipeline's environment) treated as a **downstream, regenerable copy**, never the authoritative source. The concrete, actionable practices worth naming specifically: **rotation** (high-privilege credentials rotated on a short cycle — commonly cited as weekly or even daily for the most sensitive keys, monthly for lower-privilege ones — with the genuinely ideal target being **dynamic secrets**, created on-demand per session and expiring automatically, so there's no long-lived static credential to leak at all); **least-privilege scoping** (each service or process granted access to only the specific secrets it actually needs, via the vault's own policy system — directly previewing Lesson 4's least-privilege content); and **audit logging of every secret access**, since unusual access patterns (a bulk read, an access from an unexpected source) are frequently the earliest available signal of a compromise already underway, well before its full impact becomes visible through any other channel.

## 4. How it works internally

`bcrypt.hash(password, 12)` internally generates a fresh, random salt, combines it with the password, and runs the deliberately slow Blowfish-based algorithm the specified number of iterations (`2^12`, in this example) — and, worth knowing precisely, the returned hash string **includes the salt and cost factor embedded in its own format**, so verification (`bcrypt.compare(inputPassword, storedHash)`) can extract exactly the parameters used originally without needing separate storage or bookkeeping for the salt.

## 5. Example

```
$2b$12$eR8s3Kx7vJ2Q9wL4pXm1FeH6...
 ↑  ↑↑  ↑─────────────────────↑
 |  ||  salt + hash, combined
 |  |cost factor (2^12 iterations)
 algorithm identifier
```
Everything needed to verify a future login attempt is self-contained in this one stored string — no separate salt column or table required.

## 6. Code

```ts
import argon2 from 'argon2';

// Hashing: slow, memory-hard, salted automatically —
const hash = await argon2.hash(password, { type: argon2.argon2id });

// Verifying: the ONLY operation ever performed on a stored password —
// notice there is no "decrypt" operation available, by design.
const valid = await argon2.verify(hash, attemptedPassword);
```

## 7. Failure scenarios

- **Storing passwords with a fast, general-purpose hash (SHA-256) or, worse, encrypted (reversibly)** — either mistake means a database breach directly yields every user's actual, usable password, rather than requiring genuinely infeasible offline computation.
- **A secret hardcoded in application source code or committed to version control** — a real, extremely common, entirely avoidable incident class, precisely why a dedicated secrets-management system with the vault-as-single-source-of-truth discipline exists.
- **Long-lived, over-broadly-scoped API credentials with no rotation policy** — a single leaked credential remains exploitable indefinitely, and grants far more access than the specific service holding it actually needs, violating least privilege (Lesson 4).

## 8. Common misconceptions

- **"Hashing and encryption are interchangeable."** The roadmap's own flagged misconception — one is reversible (encryption, for data you need back), the other deliberately isn't (hashing, for credentials you only ever need to verify) — using the wrong one for the wrong job is a genuine, severe security mistake, not a stylistic choice.
- **"A fast, well-known hash function like SHA-256 is secure enough for passwords."** It's cryptographically secure for integrity-checking and general hashing, and specifically *unsuitable* for passwords precisely because it's fast — the property that makes it good for one job makes it bad for the other.
- **"Environment variables are a sufficient secrets-management solution."** They're a common, minimally-acceptable delivery mechanism for a secret already managed elsewhere, not a substitute for the rotation, least-privilege scoping, and audit-logging discipline a real secrets-management system provides.

## 9. Trade-offs

Argon2id: strongest current resistance to parallelized attacks, real memory overhead per hash operation (a deliberate cost). bcrypt: simpler, extremely well-established, genuinely secure when properly tuned, less resistant to specialized hardware attacks than Argon2's memory-hardness provides. Dynamic, short-lived secrets: minimal exposure window if leaked, real operational complexity (a system generating and revoking credentials automatically) compared to simpler, longer-lived static secrets.

## 10. Real-world applications

- Every project in this curriculum handling user authentication (all of them, given Module 2's content) needs this lesson's Argon2id-or-bcrypt password storage as a non-negotiable baseline.
- Project 2's payment platform, given its stated fintech context, needs this lesson's full secrets-management discipline (rotation, least-privilege scoping, audit logging) applied to payment-provider API keys specifically, not as an afterthought.

## 11. Connections

Directly resolves the roadmap's flagged hash/encryption misconception and extends Module 1, Lesson 6's TLS content (encryption in transit) into encryption and hashing at rest. Sets up Lesson 4's least-privilege content (secrets-management scoping is a direct, concrete instance of that principle) and Lesson 5's threat modeling (secret exposure is a recurring, high-severity threat category in any real threat model).

## 12. Practical exercise

Implement password hashing and verification using Argon2id, then measure the actual time cost of hashing and verifying on your machine — confirming it's imperceptible to a real user (a few hundred milliseconds) while reasoning through why that same cost, multiplied across millions of brute-force attempts, is what actually protects the system.

## 13. Challenge

Design Project 2's secrets-management architecture: what secrets exist (payment-provider API keys, database credentials, JWT signing keys — Module 2, Lesson 5), their rotation cadence per Lesson-3's guidance, and which specific service/process is scoped to access each — using a genuine least-privilege allocation, not broad, shared access.

## 14. Mastery test

- Explain precisely why hashing and encryption are not interchangeable, using the reversibility distinction and a concrete example of using the wrong one.
- Explain, with the concrete benchmark figures from this lesson, why a fast hash function is unsuitable for password storage.
- Explain what a salt defeats specifically (rainbow tables), and why modern hashing libraries handling it automatically matters practically.
- Explain the "vault as single source of truth" principle for secrets management, and what "dynamic secrets" improve about it further.
