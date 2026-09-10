# Module Exam — 11: Security

Cumulative test across Lessons 1–5. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. Explain SQL injection's mechanism and why parameterized queries don't protect dynamic structural elements.
2. Distinguish stored, reflected, and DOM-based XSS.
3. Explain why `SameSite=Lax` provides no CSRF protection for a state-changing GET endpoint.
4. Explain DNS rebinding and why registration-time-only SSRF validation is insufficient.
5. Explain why hashing and encryption are not interchangeable, with a concrete misuse example of each.
6. Explain why a fast hash function is unsuitable for password storage, with the concrete benchmark figures.
7. Name all six STRIDE categories and the security property each violates.

## Section B — Explain in your own words

8. Explain least privilege's actual value — prevention or consequence-bounding — and why that distinction matters.
9. Explain why rate limiting a login endpoint is a security control, not just a capacity one.
10. Explain what changed in OWASP's 2025 ranking and why (Security Misconfiguration to #2, SSRF folded into Broken Access Control, Injection dropping despite unchanged severity).

## Section C — Scenario diagnosis

11. A user-controllable `ORDER BY` column on a list endpoint is exploitable despite every query value being parameterized. Diagnose and fix.
12. A webhook-registration feature validates URLs at registration but is exploited weeks later via a changed DNS record. Diagnose and fix.
13. A database breach reveals that passwords were "encrypted," not hashed, and are fully recoverable. Diagnose the design flaw.
14. A single, broadly-scoped API key used across five integrations is leaked, and the blast radius includes systems three of those integrations never needed to touch. Diagnose and redesign.

## Section D — Trade-off reasoning

15. Argue for Argon2id over bcrypt (or vice versa) for a described greenfield system (given in conversation).
16. Defend a specific least-privilege database-role design for Project 2's services, justifying every included and excluded permission.

## Section E — System design

17. Conduct a full STRIDE threat model for Project 2's core payment-processing flow, mapping each identified threat to a specific defense from this module, and documenting any accepted residual risk.

---

**On passing:** update `PROGRESS.md` — Module 11 complete, log mastery levels. Module 12 (Performance Engineering) unlocks next.
