# Module Exam — 02: Backend Fundamentals

Cumulative test across Module 2 (Lessons 1–9). No answer key here — worked through in conversation (`Exam` mode) so answers get evaluated and gaps targeted, per the mastery system in `PROGRESS.md`. Passing means mastery level 5+ (Reasoning) on every section.

---

## Section A — Recall & mechanism

1. List Fielding's six REST constraints and name the specific Richardson Maturity Model level most real "REST APIs" actually sit at.
2. What does RFC 9457's `type`, `title`, `status`, `detail`, and `instance` each represent in a Problem Details error response?
3. State precisely what OAuth 2.0's access token proves, and what OIDC's ID token adds.
4. Name the three `SameSite` cookie values and the specific cross-site request behavior each one permits.
5. Explain the "none" algorithm JWT attack and the RS256/HS256 confusion attack — what root cause do they share?
6. Name the five rate-limiting algorithms covered and the specific structural weakness of the fixed-window counter.
7. Why does offset pagination's cost grow with `OFFSET` depth even on an indexed column?
8. What does an idempotency key protect against that HTTP method idempotency (`PUT`, `DELETE`) does not?
9. What two distinct things does webhook HMAC verification plus timestamp checking protect against, respectively?

## Section B — Explain in your own words

10. Explain why HATEOAS's absence is the specific decision that creates most APIs' versioning problem.
11. Explain why "the frontend already validates this" provides zero actual protection at an API boundary.
12. Explain the revocation trade-off between JWTs and Redis-backed sessions precisely — not "sessions are more secure," but the specific mechanism each does or doesn't provide.
13. Explain GCRA's single-stored-value design and why it avoids the distributed race condition a naive counter has.
14. Explain the transactional outbox pattern's purpose using a specific crash-timing scenario.

## Section C — Scenario diagnosis

15. Your team's `GET /reports/export` endpoint triggers a slow export job as a side effect, and users report occasional duplicate exports with no corresponding duplicate click. Diagnose the likely mechanism using this module's content on method safety and caching/prefetching infrastructure.
16. A mobile client reports that after backgrounding the app for 20 minutes, API calls start failing with 401s that a simple retry doesn't fix, while a web client on the same account works fine. What's your hypothesis, tying together this module's session/JWT content?
17. Your rate limiter is deployed across 6 API server instances behind a load balancer, using local in-memory counters. Traffic analysis shows clients are getting roughly 6x their configured limit through under load. Diagnose and propose a fix.
18. A support ticket reports two identical charges for one checkout. The client says they only clicked "pay" once, but their network was flaky. Using idempotency-key content, describe your investigation process and what evidence would confirm or rule out a client-side vs. server-side root cause.

## Section D — Trade-off reasoning

19. Defend using URI-based versioning over header-based content-negotiation versioning for a specific stated API context (given in conversation) — or argue the reverse.
20. A colleague argues "we should just use JWTs everywhere and skip sessions entirely, it's simpler to have one mechanism." Argue against a single uniform choice, using this module's hybrid-pattern content.
21. Compare RBAC, ABAC, and ReBAC not by definition but by which one would strain first under a described multi-tenant sharing requirement (given in conversation).
22. Argue for or against keyset pagination for a specific described endpoint (given in conversation) that also needs a "jump to page N" feature.

## Section E — System design

23. Design the API contract, auth strategy, rate-limiting approach, pagination strategy, and idempotency handling for Project 2's core `POST /payment-intents` endpoint and its corresponding `GET /payment-intents` list endpoint. Justify every choice against a specific concept from Lessons 1–9.

## Section F — Debug

24. You'll be handed a webhook handler implementation (in conversation) with a subtle security flaw in its signature verification. Find it and explain the exploit it enables.

---

**On passing:** update `PROGRESS.md` — Module 2 status to "Complete," log per-topic mastery levels and any misconceptions caught. Module 3 (Databases) unlocks after this — per `ROADMAP.md`, this is the highest-leverage module in the curriculum, so don't rush past this exam if any section is shaky.
