# Authentication vs. Authorization — Who You Are vs. What You Can Do

## 1. Why does this exist?

These two concerns get bundled together constantly ("auth" as one word in casual conversation, and often in code — a single `AuthGuard`), but they answer different questions, fail differently, and are solved by different mechanisms. Conflating them is a real, recurring source of security bugs: a system that correctly confirms *who* someone is but doesn't separately, rigorously check *what that specific identity is allowed to do* on *this specific resource* has a real vulnerability, not a theoretical one.

## 2. Mental model

Authentication (AuthN) is showing your ID at the door — proving you are who you claim to be. Authorization (AuthZ) is the separate question of whether the person whose ID just checked out is actually allowed into *this specific room*, to do *this specific thing*, on *this specific resource*. A building can have flawless ID checking at the front door and still be completely insecure if it doesn't separately enforce which badges open which doors.

## 3. Simple explanation

**Authentication** establishes identity — the system now has a reliable claim of "this request is from user #42." **Authorization** takes that established identity and decides, for a specific action on a specific resource, whether it's permitted — "is user #42 allowed to delete order #9981?" These must be checked *every time*, on *every resource*, not assumed to follow automatically from successful authentication — a request being authenticated says nothing about what that authenticated user is entitled to do.

## 4. Technical explanation

**OAuth 2.0 (RFC 6749) is an authorization framework, not an authentication protocol — despite how often it's used as if it were one.** OAuth 2.0's actual job: let a third-party application obtain limited, scoped access to a resource on a user's behalf, without that application ever seeing the user's actual credentials. Its output is an **access token** — a credential proving "this bearer is allowed to do X, within scope Y, for a limited time" — and critically, OAuth 2.0 itself defines *no standard way* to learn who the underlying user actually is. Using a bare OAuth 2.0 access token to answer "who is this user" is a well-known, historically common misuse of the protocol for a job it wasn't designed to do.

**The authorization code flow with PKCE — the modern default flow, and why it looks the way it does:**
1. Your app redirects the user to the authorization server (e.g., an identity provider) with a `code_challenge` — a hashed value derived from a locally-generated, high-entropy `code_verifier` your app keeps secret.
2. The user authenticates *at the authorization server*, not your app — your app never sees or handles the user's actual password, a genuinely important security property.
3. The authorization server redirects back with a short-lived **authorization code**.
4. Your app exchanges that code, plus the original `code_verifier`, for an access token at a token endpoint — the authorization server hashes the incoming `code_verifier` and checks it matches the `code_challenge` from step 1.
5. **PKCE's specific job**: step 3's redirect happens through the browser (a public channel), meaning the authorization code itself could theoretically be intercepted by another app on the same device (a real risk for mobile/single-page apps, historically called "public clients" — they can't safely hold a long-lived client secret the way a server-side confidential client can). Without PKCE, an attacker who intercepts the code could exchange it for a token themselves. With PKCE, the attacker would also need the `code_verifier` — which never left your app and never traveled through the redirect — making the intercepted code alone useless. Current best practice (and most identity providers now enforce this) is to use PKCE on *every* client, confidential or not, not just public ones, because it closes this specific interception vector at negligible cost.

**OpenID Connect (OIDC) — the authentication layer OAuth 2.0 deliberately doesn't provide, built on top of it:** OIDC adds a standardized **ID token** (a JWT — see Lesson 5) alongside the OAuth access token, containing verifiable claims about the authenticated user (`sub` — a stable subject/user identifier, `email`, `name`, issued/expiry timestamps). This is the piece that actually answers "who is this," in a standardized, verifiable way — OAuth 2.0 alone never did. **The practical rule this produces: if your system needs to know who a user is (authentication), you want OIDC's ID token; if it only needs to know what a token bearer is allowed to access on some external service (authorization to a resource), plain OAuth 2.0's access token is the right and sufficient tool** — using the wrong one for the job is a common, real design mistake.

**Authorization models — once identity is established, how do you actually decide what's allowed:**
- **RBAC (Role-Based Access Control)**: permissions are attached to roles, roles to users — "is this user's role permitted to perform this action." Simple to reason about and audit, and the right default for systems with a small, stable set of coarse-grained permission tiers (admin/editor/viewer). Becomes unwieldy as the permission surface grows more granular ("editor, but only for documents in their own department, and only during business hours" strains a pure role model into an explosion of hyper-specific roles).
- **ABAC (Attribute-Based Access Control)**: a policy engine evaluates arbitrary attributes of the user, the resource, and the request context (time of day, geographic location, a document's classification level vs. the user's clearance) against a rule set at request time. Handles exactly the fine-grained, contextual cases RBAC struggles with, at the cost of policies that are genuinely harder to reason about, audit, and predict the combined effect of — a real, documented trade-off, not a strict improvement.
- **ReBAC (Relationship-Based Access Control)**: permissions are modeled as edges in a relationship graph ("user A can edit document D because A is a member of team T, and T was granted edit access to D's parent folder F") and evaluated by graph traversal at check time. Popularized by Google's internal **Zanzibar** system (the paper describing the authorization system behind Google Drive, Docs, etc.) and now available as open implementations (OpenFGA — a CNCF project as of late 2025, SpiceDB, Ory Keto, Permify). This is specifically the right model for collaboration/document-sharing/multi-tenant SaaS products — directly relevant to your Project 4 (Multi-Tenant SaaS) — where "who can access this" is fundamentally a question about nested ownership and sharing relationships, not a flat role.
- **Practical 2026-era default for real SaaS products**: a hybrid — RBAC for coarse-grained, organization-level policy ("is this user an admin of this workspace at all") layered with ReBAC or ABAC for resource-level, fine-grained checks ("can this specific user access this specific shared document") — rather than forcing one model to do both jobs.

## 5. How it works internally

A NestJS request typically runs through two conceptually separate guards, even if implemented as one pipeline: an authentication guard first (verifying a JWT's signature and expiry, or validating a session — Lesson 4/5, establishing `req.user`), and *only after that succeeds*, a separate authorization check (a `@Roles()` decorator, a policy evaluation call to an ABAC/ReBAC engine) that decides whether `req.user` can perform *this specific* action on *this specific* resource. Collapsing these into a single check ("is this JWT valid, therefore allow the request") is exactly how authentication gets mistaken for authorization in real codebases.

## 6. Example

A concrete failure of conflating the two: an API endpoint `GET /orders/:id` that correctly requires a valid JWT (authentication passes) but never checks whether the authenticated user actually *owns* order `:id` (authorization is skipped entirely) — any logged-in user can read any other user's order by guessing/incrementing IDs. This exact bug class has a name in security literature: **IDOR (Insecure Direct Object Reference)**, and it is one of the single most common real-world API vulnerabilities, precisely because it's what happens when authentication is treated as if it implies authorization.

## 7. Code

```ts
@UseGuards(JwtAuthGuard) // authentication: establishes req.user, nothing more
@Get('orders/:id')
async getOrder(@Param('id') id: string, @Req() req) {
  const order = await this.orders.findById(id);

  // authorization: a SEPARATE, explicit check — never implied by
  // the guard above having passed.
  if (order.userId !== req.user.id) {
    throw new ForbiddenException(); // 403, not 401 — see Lesson 1's status-code semantics
  }
  return order;
}
```

## 8. Failure scenarios

- **IDOR** (above) — the canonical authentication/authorization conflation bug.
- **Using an OAuth access token to identify a user without OIDC's ID token** — a token proving "allowed to call this API with this scope" doesn't reliably prove "this is user #42" the way an ID token's signed `sub` claim does; treating them as equivalent is a documented historical misuse.
- **Over-broad RBAC roles created as a shortcut** ("just make them admin, it's easier than defining a custom role") — a real, common source of privilege creep that ABAC/ReBAC's finer granularity exists specifically to avoid needing.
- **Authorization checks performed client-side only** (hiding a UI button) with no server-side enforcement — identical in kind to Lesson 2's "the frontend already validates this" mistake, just applied to permissions instead of data shape.

## 9. Common misconceptions

- **"OAuth 2.0 is a login system."** It's an authorization delegation framework; OIDC, built on top of it, is the actual login/authentication layer. Calling an OAuth-only integration "login with X" without OIDC is a real, if common, misuse.
- **"If a request has a valid token, it's allowed to do whatever it's asking."** A valid token proves identity (or delegated access) — it says nothing, by itself, about whether *this specific* action on *this specific* resource is permitted for that identity.
- **"RBAC is always simpler and therefore always the right default."** It's simpler for coarse-grained permission structures and becomes a liability (role explosion, or under-granular roles causing over-permissioning) once your product's actual sharing/permission model is inherently relational — which most real multi-tenant SaaS products are.

## 10. Trade-offs

RBAC: easy to audit, easy to reason about, poor fit for fine-grained or relationship-driven permissions. ABAC: handles arbitrary contextual logic, harder to audit and predict in combination. ReBAC: naturally models real-world sharing/ownership graphs (exactly what most collaborative SaaS products actually need), but requires adopting a graph-based mental model and typically a dedicated policy engine rather than a simple roles table.

## 11. Real-world applications

- Google Drive/Docs-style "who can see this file" logic is the textbook ReBAC use case (and literally what Zanzibar was built for).
- Any B2B SaaS with organizations, teams, and shared resources (directly relevant to Project 4) needs at minimum a hybrid RBAC+ReBAC model — a flat roles table alone will not correctly express "an editor on Team A's documents, but only the ones Team A has explicitly shared with them."
- Payment platforms (Project 2) commonly apply ABAC-style contextual rules on top of RBAC — e.g., a support agent role that can view transaction details but only below a certain dollar threshold, or only for accounts they're currently assigned to.

## 12. Connections

Feeds directly into Lesson 4 (Sessions & Cookies) and Lesson 5 (JWT) — both are authentication *mechanisms*; this lesson is the conceptual layer above them establishing why authentication alone is an incomplete answer to "is this request allowed." Directly relevant to Level 11 (Security — IDOR and broken access control are OWASP Top 10 categories) and Project 4 (Multi-Tenant SaaS, where the authorization model is a first-order design decision, not an afterthought).

## 13. Practical exercise

Take an app or API you've built with more than one resource type owned by users. Audit every endpoint: for each, is there an explicit authorization check beyond "is this request authenticated," and does it verify ownership/permission on the *specific* resource ID in the request, not just the resource type in general?

## 14. Challenge

Design the authorization model for Project 4 (Multi-Tenant SaaS): organizations, teams within organizations, and documents that can be shared either with a whole team or with specific individual users outside their team. Decide which model(s) from this lesson you'd use, and where the boundary between RBAC and ReBAC responsibilities sits in your design.

## 15. Mastery test

- State, precisely, what OAuth 2.0's access token proves and what it does not prove — and what OIDC's ID token adds that closes that specific gap.
- Explain what problem PKCE solves and why it matters specifically for public clients (mobile/SPA) more than confidential server-side clients, even though current best practice applies it everywhere.
- Given a scenario describing a multi-tenant document-sharing feature, justify which authorization model (RBAC, ABAC, ReBAC, or a specific hybrid) fits best and why the alternatives would strain under the same requirements.
- Define IDOR precisely enough to identify it in a code review, and explain why it's fundamentally an authorization failure, not an authentication one.
