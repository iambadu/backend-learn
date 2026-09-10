# DNS — The Resolution Chain

## 1. Why does this exist?

IP addresses (Lesson 1) identify machines but aren't something humans (or maintainable code) should hardcode — they change (server migrations, cloud IP reassignment, failover), and one name often needs to map to *different* IPs depending on where the requester is (CDN routing) or which server is healthy right now (load balancing, DNS-based failover). DNS is the system that lets `api.example.com` resolve to the right IP, right now, without every client needing to know or care what that IP is.

## 2. Mental model

DNS is a distributed, hierarchical, cached phone book — no single server holds the whole thing. Finding a number means asking someone who knows *part* of the hierarchy, who points you to someone who knows more, until you reach whoever is authoritative for that specific name.

## 3. Simple explanation

You type/request `api.github.com`. Your machine needs an IP address to open a TCP connection (Lesson 2) to. DNS resolution is the process of turning that name into an IP, by walking down a hierarchy: root → top-level domain (`.com`) → the domain's own nameservers (`github.com`'s authoritative servers) → the specific record for `api.github.com`.

## 4. Technical explanation

**The resolution chain, in order, for a name that's never been looked up before:**
1. **Browser/OS cache check** — if this name was resolved recently and the TTL hasn't expired, return the cached IP immediately. No network traffic at all.
2. **Recursive resolver** (usually your ISP's, or a public one like `8.8.8.8`/`1.1.1.1`) — your machine asks this resolver to do the full lookup on its behalf. The resolver itself checks its own cache first.
3. If not cached, the resolver queries a **root nameserver** — asks "who handles `.com`?"
4. The root server returns the **TLD nameserver** (top-level domain, e.g. `.com`'s servers) — the resolver asks it "who handles `github.com`?"
5. The TLD server returns `github.com`'s **authoritative nameservers** — the resolver asks one of those "what's the A/AAAA record for `api.github.com`?"
6. The authoritative server returns the actual IP. The resolver caches it (per the record's TTL) and returns it to your machine, which also caches it.

Each of steps 3–6 is a separate round trip in the worst case (**iterative** resolution, uncached at every level) — this is why the *first* request to a brand-new hostname can have a real, measurable latency spike before the connection (TCP handshake, then TLS, then the actual request) even starts. Caching at every level is what makes subsequent lookups fast.

**Record types you'll actually touch as a backend engineer:** `A` (hostname → IPv4), `AAAA` (→ IPv6), `CNAME` (alias to another hostname — common for pointing your domain at a cloud provider's load balancer), `MX` (mail routing), `TXT` (arbitrary text — used for domain verification and, notably, SPF/DKIM email-authentication records).

**TTL is a real trade-off, not a formality:** a short TTL (e.g., 60s) means DNS-based failover or IP changes propagate fast, but costs more lookups (more recursive-resolver load, slightly more latency for cache-miss requests). A long TTL means better caching/performance but slower failover — if your server's IP changes and TTL is 24 hours, some clients will keep trying the old IP for up to a day.

## 5. How it works internally

`dns.lookup()` in Node actually goes through the OS's resolver (which may hit `/etc/hosts`, `/etc/resolv.conf`-configured resolvers, etc.) rather than doing a pure DNS query itself — this is a real gotcha: `dns.lookup` and `dns.resolve4` in Node behave differently (one uses the OS's `getaddrinfo`, the other issues an actual DNS query), and this has bitten people when the OS resolver caches something the DNS server has already changed.

## 6. Example

```
dig api.github.com          # shows the full resolution result and TTL
dig +trace api.github.com   # walks the ENTIRE chain: root → TLD → authoritative, showing every hop
```
Run `+trace` once — seeing the actual hierarchy walked live makes the abstract chain concrete.

## 7. Code

```js
import dns from 'node:dns/promises';

const addresses = await dns.resolve4('api.github.com');
console.log(addresses); // the actual A records, with no OS-level caching interference

const start = Date.now();
await dns.resolve4('some-hostname-you-havent-queried-recently.com');
console.log('cold lookup took', Date.now() - start, 'ms');
```

## 8. Failure scenarios

- **DNS propagation delay**: you change a record, but clients with the old value cached (per TTL) keep using it until it expires — a common cause of "I updated the DNS an hour ago and it's still not working for some users."
- **DNS server outage**: if your resolver (or, worse, your domain's authoritative nameservers) goes down, *nothing resolving that name works*, even if the actual server behind it is perfectly healthy. This is a full outage that has nothing to do with your application.
- **Stale/incorrect caching at the OS or application level**: long-lived Node processes using `dns.lookup` can cache resolution results in ways that don't respect TTL exactly as you'd expect, causing a service to keep hitting a decommissioned IP after a migration.
- **DNS as an attack surface**: DNS spoofing/cache poisoning (attacker injects a fake response) is why DNSSEC exists (cryptographically signed records) — relevant context, full implementation is out of scope here.

## 9. Common misconceptions

- **"DNS changes are basically instant."** Only if TTL is short and every layer of caching (browser, OS, resolver) respects it — in practice, propagation can visibly lag.
- **"DNS lookup happens once per app, not once per request."** It depends entirely on caching behavior at the client — a poorly configured client can re-resolve on every request, adding real latency; a well-configured one caches per TTL.
- **"DNS is just for websites."** Every microservice-to-microservice call, every database connection string using a hostname, every third-party API call goes through this same chain.

## 10. Trade-offs

Short TTL: fast failover/propagation, more lookup overhead. Long TTL: better performance/caching, slower to react to change. This exact trade-off reappears at Level 5 (Caching) in a more general form — DNS TTL is your first encounter with "how long do I trust a cached value" as a concrete engineering decision, not an abstract one.

## 11. Real-world applications

- Blue-green deployments and failover strategies often lean on low-TTL DNS records to redirect traffic to a new environment.
- CDNs (Cloudflare, Fastly) use DNS to return *different* IPs to different requesters based on geography — this is the mechanism, not magic, behind "the CDN routes you to the nearest edge node."
- Service discovery in distributed systems (Level 7) is, at its core, solving the same problem DNS solves — "given a name, find a current, healthy address" — just often at a faster refresh rate than public DNS TTLs would allow.

## 12. Connections

Directly depends on Lesson 3 (UDP) — most DNS queries are UDP for exactly the reasons Lesson 3 covers (single round trip, low overhead, application-level retry is enough). Precedes every TCP connection (Lesson 2) your backend ever makes, since you almost always connect by hostname, not raw IP. TTL trade-offs here foreshadow cache invalidation (Level 5) directly.

## 13. Practical exercise

Run `dig +trace` against a hostname you use regularly (your own API's domain if you have one, or any public API). Identify: which server was authoritative for the final answer, and what TTL was returned. Then explain what would happen, end to end, if that hostname's IP changed right now — who would notice immediately, and who wouldn't, and why.

## 14. Challenge

You're migrating your API from one cloud provider to another, which means the IP changes. Design a DNS-level rollout plan that minimizes downtime, using TTL as your main lever. What do you do *before* the migration (with TTL), during, and after?

## 15. Mastery test

- Walk the full resolution chain for a hostname that's never been queried by anyone, anywhere, listing every hop and what's cached where afterward.
- Why can two different clients experience different propagation delay for the *same* DNS record change?
- What's the actual difference between `dns.lookup` and `dns.resolve4` in Node, and why does it matter in a long-lived server process?
