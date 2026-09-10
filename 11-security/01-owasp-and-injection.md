# OWASP Top 10 & Injection — Necessary but Not Sufficient

## 1. Why does this exist?

Module 4, Lesson 1 already showed you `PreparedStatement`'s two roles — security and performance — and named SQL injection as the mechanism it prevents. This lesson is the full, dedicated security treatment: the current OWASP Top 10 as the industry's actual, evidence-based ranking of what breaks real production systems, and injection given the depth it deserves, including the specific, flagged misconception that parameterization alone solves the whole problem.

## 2. Mental model

OWASP's Top 10 isn't a theoretical checklist — it's closer to a coroner's report, ranking vulnerability categories by how often they're actually found causing real breaches in real, audited applications. Injection is the oldest, most literal member of that list: tricking a system into treating attacker-supplied *data* as attacker-supplied *instructions*, and every injection variant (SQL, NoSQL, command, and others) is the identical underlying confusion, just targeting a different interpreter.

## 3. Technical explanation

**The current OWASP Top 10 (2025 edition, finalized January 2026, superseding the 2021 list) — worth knowing the actual current ranking and what changed, since the list evolves with real, observed attack data, not a static curriculum:**
- **A01: Broken Access Control** (the top spot) — now explicitly encompasses **BOLA** (Broken Object Level Authorization — Module 2, Lesson 3's IDOR content, precisely) and **BFLA** (Broken Function Level Authorization) as the most exploited patterns in modern, API-heavy applications — a direct, current confirmation that Module 2, Lesson 3's authorization-not-authentication distinction is the single most consequential security lesson in this curriculum, not an academic nicety.
- **A02: Security Misconfiguration** — jumped from #5 in the prior list to #2, a genuinely significant re-ranking reflecting that continuous deployment (Module 9, Lesson 3) without continuous security scanning creates active, ongoing exposure windows — a direct, current argument for why security review can't be a one-time, pre-launch activity in a system that deploys continuously.
- **A03: Software Supply Chain Failures** (new for 2025) — expands the prior "vulnerable and outdated components" category to the entire supply chain: dependencies, build systems, and distribution infrastructure — reflecting the current, real threat of a compromised npm package or build pipeline, not just an outdated library version.
- **A05: Injection** — this lesson's focus, notably **dropped** from #3 to #5 in the current ranking (not because it's less dangerous when it occurs, but because parameterization, Module 4 Lesson 1's content, has become widespread enough as a default practice to reduce its relative frequency) — still carrying the single largest number of associated CVEs of any category, a real, important nuance: lower *ranking* doesn't mean lower *severity* when it does occur, it reflects prevalence trending down due to better default tooling.
- **A10: Mishandling of Exceptional Conditions** (new for 2025) — improper error handling, "failing open" (a system defaulting to permissive/insecure behavior when something goes wrong, rather than failing safely) — a genuinely important, previously under-recognized category directly connecting to this curriculum's repeated emphasis (Module 7's entire distributed-systems content) that failure modes need deliberate design, not assumption.
- **SSRF is now folded into Broken Access Control** rather than standing as its own category — a reflection that SSRF (Lesson 2) is, at root, an access-control failure (the server is tricked into making a request it shouldn't be authorized to make), not a distinct vulnerability class.

**SQL injection, precisely, extending Module 4, Lesson 1's introduction — the exact mechanism, not just "unsafe string concatenation":** when user input is concatenated directly into a SQL string rather than passed as a separate, typed parameter, an attacker can supply input containing SQL syntax that the database then executes as part of the query's actual logic — `' OR '1'='1` appended to a login query's password check can turn `WHERE username = ? AND password = '$input'` into a tautology that matches every row, bypassing authentication entirely without ever guessing a real password. `PreparedStatement`'s parameterization (Module 4, Lesson 1) closes this specific vector by sending the value through a channel the database never interprets as SQL syntax, regardless of its content.

**Why "parameterized queries alone prevent all injection" is false — the roadmap's own flagged misconception, worth grounding precisely since it's a genuinely common overconfidence:** parameterization protects **values** substituted into a query — it does **not** protect dynamically-constructed SQL **structure** (a column name, a table name, an `ORDER BY` direction built from user input) if that structure is still concatenated directly into the query string, because a parameter placeholder can only ever represent a *value*, never a structural element like an identifier — a common, real, genuinely-still-vulnerable pattern is `ORDER BY ${userSuppliedColumn}`, where no amount of parameterizing the *values* elsewhere in the query protects this specific, structural injection point. The correct fix for dynamic structural elements is an explicit **allow-list** (validate the requested column name against a known, fixed set of legitimate options) — not parameterization, which is structurally incapable of addressing this case at all.

**Injection is a general pattern, not a SQL-specific one — worth naming the other, real variants precisely, since the underlying mechanism (untrusted input reaching an interpreter that can't distinguish data from instructions) recurs identically across different targets:**
- **NoSQL injection**: a MongoDB query built by naively passing a user-supplied object directly into a query filter can let an attacker inject query operators (`{"$ne": null}` instead of an expected literal value) that alter the query's logic — the identical underlying vulnerability as SQL injection, just against a different interpreter with different syntax.
- **Command injection**: user input passed to a shell command (`exec("convert " + userFilename)`) lets an attacker inject shell metacharacters to run arbitrary commands on the host — the same "data treated as instructions" confusion, now against the OS shell instead of a database.
- **The general, transferable principle, worth stating as the actual takeaway rather than memorizing each variant separately**: any time untrusted input reaches an interpreter (SQL, a shell, a template engine, a NoSQL query builder) without a strict separation between "this is data" and "this is instructions," the injection pattern is structurally possible — parameterization/prepared-statement-equivalents, allow-lists for structural elements, and strict input validation at the trust boundary (Module 2, Lesson 2's validation content) are the recurring, general defenses.

## 4. How it works internally

A Drizzle query built via its query builder (Module 4, Lesson 4) is, underneath, generating parameterized SQL automatically — this is a real, structural safety property of choosing a query builder or ORM over hand-concatenated SQL strings, worth stating explicitly as one genuine argument (among Module 4's other trade-offs) in favor of not hand-rolling raw SQL string concatenation, even for a team with strong SQL fluency: it's not really about convenience, it's that the tool structurally makes the injection mistake harder to make by default.

## 5. Example

```ts
// VULNERABLE: user input concatenated directly into SQL structure —
// parameterizing the WHERE clause elsewhere does NOT protect this:
const query = `SELECT * FROM orders ORDER BY ${req.query.sortColumn}`;

// SAFE: an explicit allow-list for the structural element:
const ALLOWED_COLUMNS = new Set(['created_at', 'total', 'status']);
const sortColumn = ALLOWED_COLUMNS.has(req.query.sortColumn) ? req.query.sortColumn : 'created_at';
const query = `SELECT * FROM orders ORDER BY ${sortColumn}`; // now safe — validated against a fixed set
```

## 6. Code

```ts
// NoSQL injection — the identical pattern, different interpreter:
// VULNERABLE if req.body.password can be an object like {"$ne": null}:
await db.collection('users').findOne({ username: req.body.username, password: req.body.password });

// SAFE: explicitly coerce and validate expected types before querying —
// Module 2, Lesson 2's validation content, applied here directly:
const { username, password } = LoginSchema.parse(req.body); // Zod ensures these are strings, not objects
await db.collection('users').findOne({ username, password: hash(password) });
```

## 7. Failure scenarios

- **A dynamic `ORDER BY`/column-name feature built with string concatenation**, exploited precisely because a developer correctly parameterized every *value* in the query and assumed that was sufficient — the exact, specific gap this lesson's flagged misconception addresses.
- **A NoSQL API endpoint passing a raw, unvalidated request body directly into a query filter**, allowing query-operator injection that bypasses intended authentication or authorization logic entirely.
- **Security review treating "we use an ORM" as a complete answer** without checking for raw-SQL escape hatches (Module 4, Lesson 5's `sql` tagged template) used carelessly with unparameterized, concatenated input.

## 8. Common misconceptions

- **"Parameterized queries alone prevent all injection."** The roadmap's own flagged misconception — they protect values, not dynamically-constructed structural SQL elements, which require a separate, explicit allow-list defense.
- **"Injection is only a SQL problem."** It's a general pattern (untrusted input reaching an interpreter without a data/instruction separation) that recurs identically across SQL, NoSQL, shell commands, and other interpreters.
- **"Lower OWASP ranking means lower severity."** Injection's drop to #5 reflects reduced *prevalence* due to better default tooling, not reduced *severity* on the occasions it still occurs — a single successful SQL injection remains a catastrophic, often full-database-compromise event.

## 9. Trade-offs

Strict allow-lists for dynamic structural SQL elements add real, if usually small, development friction (enumerating and maintaining the legitimate set of values) in exchange for closing an injection vector parameterization structurally cannot address — a trade that's essentially always worth making given the severity of the alternative.

## 10. Real-world applications

- Every user-facing sort/filter feature on a list endpoint (Module 2, Lesson 7's pagination content, directly) is a realistic, common place the structural-injection gap this lesson describes actually shows up in real production code.
- OWASP's Top 10, revised with real, current attack data every few years, is directly, professionally relevant — security reviews and compliance audits across the industry are commonly organized around this exact list.

## 11. Connections

Directly extends Module 4, Lesson 1's `PreparedStatement` content with the full mechanism and its specific limitation. Depends on Module 2, Lesson 3's IDOR content (now formally A01, the top OWASP category) and Module 2, Lesson 2's validation content (the general defense against every injection variant).

## 12. Practical exercise

Find or construct an endpoint with a user-controllable sort column, deliberately exploit the structural-injection gap (if using string concatenation) to confirm it's exploitable, then fix it with an explicit allow-list and confirm the exploit no longer works.

## 13. Challenge

Audit Project 1 or Project 2's codebase for every place user input reaches a database query, a shell command, or a NoSQL filter, and classify each as safely parameterized/validated or exploitable, using this lesson's general injection principle rather than only checking for the SQL-specific case.

## 14. Mastery test

- Explain SQL injection's mechanism precisely enough to construct a working example given a vulnerable query pattern.
- Explain precisely why parameterized queries don't protect dynamic structural SQL elements, and what the correct defense is instead.
- State the general, transferable injection principle and apply it to identify a NoSQL or command-injection vulnerability from a description.
- Name three categories from the current OWASP Top 10 and explain what changed about the list's ranking or composition for 2025, and why.
