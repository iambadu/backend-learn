# Proxies & Load Balancers — L4 vs L7, Algorithms, and What's Actually Deciding Where Your Request Goes

## 1. Why does this exist?

A single server can't survive real traffic or real failure — it has finite capacity, and it's a single point of failure. Proxies and load balancers are the layer that sits between clients and your actual application servers to solve two separable problems: **indirection** (clients don't need to know which specific server handles them, or how many there are) and **distribution** (spreading load, and routing around unhealthy servers, without the client ever knowing anything went wrong). These are almost always taught together but are conceptually distinct, and conflating them is where a lot of hand-wavy understanding comes from.

## 2. Mental model

A **forward proxy** sits in front of *clients* and is invisible to the servers those clients talk to — it represents and often hides the client (a corporate proxy filtering employee traffic, a VPN). A **reverse proxy** sits in front of *servers* and is invisible to the clients making the requests — it represents and hides your backend infrastructure. The distinction is entirely about *whose interest the proxy represents*, not any technical property of the proxy software itself — the same software (Nginx, HAProxy) can be configured to do either job. A **load balancer** is a reverse proxy whose specific job is choosing *which* backend, among several, should handle this particular request or connection.

## 3. Simple explanation

- **Forward proxy**: client → proxy → server. The server sees the proxy's IP, not the client's. Used for client anonymization, content filtering, egress control.
- **Reverse proxy**: client → proxy → one of several servers. The client sees the proxy's IP/hostname, never the individual backend server's. Used for TLS termination, caching, compression, and as the entry point that makes load balancing possible in the first place.
- **Load balancer**: a reverse proxy (or a lower-layer equivalent, see below) that distributes incoming requests/connections across a pool of backend servers according to some algorithm, and stops sending traffic to servers that fail health checks.

## 4. Technical explanation

**L4 (transport-layer) vs L7 (application-layer) load balancing — a real, structural difference, not a naming convention:**

An **L4 load balancer** operates purely on the TCP/UDP connection — it makes its routing decision by hashing or inspecting the connection's 5-tuple (source IP, source port, destination IP, destination port, protocol) and forwards raw packets to a chosen backend, without ever parsing HTTP, TLS, or any application-layer content. Because it does no payload inspection, it's extremely fast and can sustain very high throughput at very low per-packet latency (roughly 50–100 microseconds of added latency and 10–40 Gbps of throughput per node are typical figures for production L4 balancers) — but it cannot make decisions based on URL path, HTTP headers, or cookies, because it never looks that deep. Once an L4 balancer picks a backend for a connection, all packets in that connection typically go to the same backend for the connection's lifetime.

An **L7 load balancer** terminates the actual application protocol (usually HTTP/HTTPS — meaning it also typically does TLS termination) and can inspect and route on URL path, headers, cookies, or even request body content. This lets you do things like "route `/api/v2/*` to the new service, everything else to the legacy one" or "route based on a session cookie for sticky sessions" — genuinely content-aware routing. The cost is real: parsing and buffering full HTTP requests is meaningfully more expensive than 5-tuple hashing, with production L7 balancers typically adding roughly 0.5–3 milliseconds of latency and sustaining lower per-node throughput (roughly 1–5 Gbps) compared to L4.

**Most real production architectures use both, layered**: an L4 balancer (or anycast + ECMP routing, see Maglev below) absorbs raw connection volume and spreads it across a pool of L7 balancer instances, which then do the content-aware routing to your actual application servers. This isn't redundancy for its own sake — it's putting the cheap, high-throughput layer in front to protect the more expensive, smarter layer from being overwhelmed.

**Load balancing algorithms, and when each one is the right call:**
- **Round robin**: requests distributed sequentially across the backend pool. Simple, works well when backends are homogeneous and request costs are roughly uniform. Breaks down when request costs vary — a backend that happens to get a run of expensive requests still gets the same share of new traffic as an idle one.
- **Least connections**: routes to whichever backend currently has the fewest open connections, on the assumption that connection count is a reasonable proxy for current load. Better than round robin when request durations vary significantly (long-running requests naturally get deprioritized for new traffic once they've pushed a backend's connection count up).
- **IP hash**: routes based on a hash of the client's IP, giving the same client a consistent backend across requests without needing a session store — useful for simple session affinity, but brittle: NAT can make many distinct clients share one IP (over-concentrating them on one backend), and the mapping breaks entirely if the backend pool changes size (see consistent hashing below for why that specific failure matters).
- **Consistent hashing**: a hashing scheme designed so that when the backend pool changes size (a server added or removed), only a small, bounded fraction of the key space needs to remap to a different backend — a plain modulo-based hash (`hash(key) % N`) would remap *almost everything* when `N` changes, which is catastrophic for anything relying on request affinity (e.g., a distributed cache where losing affinity means a wave of cache misses). This same technique reappears at Level 7 (Distributed Systems) for sharding, not just load balancing — it's a general solution to "map keys to a changing set of nodes without massive reshuffling."
- **Maglev hashing (Google, real production system)**: a specific consistent-hashing algorithm designed to solve a problem generic consistent hashing under-optimizes — near-*perfectly even* load distribution across backends, not just low churn on membership change. Maglev builds a fixed-size lookup table where each backend claims an (approximately) equal number of table slots; a connection's 5-tuple hash maps to a slot, which maps to a backend. When the backend set changes, the table is recomputed, but the algorithm is specifically designed to minimize how many existing mappings shift. In Google's actual production deployment, upstream routers spread raw packets across a pool of Maglev machines using **ECMP (Equal-Cost Multi-Path routing)** — an L3/L4-level technique for splitting traffic across multiple paths of equal routing cost — and each Maglev instance independently applies its consistent-hash table to pick the real backend, without needing to coordinate state with the other Maglev instances. This is a genuinely elegant answer to "how do you load-balance at massive scale without a single point of coordination."
- **Weighted variants** of any of the above (weighted round robin, weighted least connections) — used when backends have heterogeneous capacity (some servers are simply bigger) and should receive proportionally more traffic.

**Health checks — active vs passive, and why both exist:**
- **Active health checks**: the load balancer independently, on its own schedule, probes each backend (an L4 TCP-connect check, typically with a 3–5 second timeout, or an L7 HTTP request to a dedicated `/health` endpoint) and removes a backend from rotation if it fails. This catches problems *before* real user traffic hits a broken backend, at the cost of extra probe traffic and some detection lag equal to the check interval.
- **Passive health checks (outlier detection)**: the load balancer observes real traffic's success/failure rate per backend and ejects a backend once it crosses a threshold — a common production pattern is ejecting after some number of consecutive errors (e.g., 5) or once a backend's error rate crosses a percentage threshold (e.g., 10%) within a window, then quarantining it for a cooldown period (commonly 30–60 seconds) before cautiously reintroducing it to rotation. This catches failures active checks might miss (a backend that passes a trivial `/health` check but fails on real, heavier requests) but necessarily costs some real requests failing before detection kicks in.
- Production systems (HAProxy, Envoy, cloud load balancers) generally run both together — active checks for baseline liveness, passive/outlier detection for real-traffic-driven failure modes active checks can't see.

## 5. How it works internally

When a client connects to your API's public hostname, DNS (Lesson 4) typically resolves to the load balancer's IP, not any individual backend's — the backend servers frequently don't even have public IPs at all, reachable only from inside the load balancer's private network. For an L7 HTTPS load balancer doing TLS termination (Lesson 6): the client's TLS handshake completes *with the load balancer*, which decrypts the request, applies routing logic, and then either re-encrypts a new connection to the chosen backend (TLS all the way through) or forwards over plain HTTP within a trusted private network (a common, deliberate trade-off — see failure scenarios). The backend server, in either case, never directly negotiates TLS with the original client.

## 6. Example

```
curl -v https://api.github.com   # note the resolved IP — this is almost never
                                  # a single origin server's IP for any API at scale
```
Compare that resolved IP against a `traceroute` (Lesson 1) to it — production APIs behind a CDN/load balancer typically show your traffic terminating at infrastructure geographically close to you, not at wherever the "real" servers physically live.

## 7. Code

A minimal illustration of L7, content-aware routing logic — the same decision an Nginx/HAProxy/Envoy config expresses declaratively, made explicit in code:
```js
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';

const backends = {
  '/api/v2': { host: 'new-service', port: 4001 },
  default: { host: 'legacy-service', port: 4000 },
};

const proxy = createServer((clientReq, clientRes) => {
  const target = clientReq.url.startsWith('/api/v2')
    ? backends['/api/v2']
    : backends.default;

  const proxyReq = httpRequest(
    { host: target.host, port: target.port, path: clientReq.url, method: clientReq.method, headers: clientReq.headers },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );
  clientReq.pipe(proxyReq);
});

proxy.listen(8080);
```
This is content-aware (L7) routing on `clientReq.url` — exactly the class of decision an L4 balancer structurally cannot make, because it never parses `clientReq.url` at all.

## 8. Failure scenarios

- **TLS termination without re-encryption to the backend ("TLS-terminating reverse proxy" pattern)**: traffic between the load balancer and backend travels unencrypted. This is a deliberate, common trade-off (saves the backend from doing its own TLS handshakes, simplifies certificate management to one place) that is only safe if the network between LB and backend is genuinely trusted/private — a real security decision, not a default to accept blindly (previews Level 11).
- **Sticky-session load balancing masking a horizontal-scaling problem**: if your app relies on IP-hash or cookie-based session affinity to always route a user to the same backend (because that backend holds in-memory session state), you've quietly broken HTTP's statelessness assumption from Lesson 5 — that backend becomes a soft single point of failure for every user pinned to it, and rebalancing load becomes harder. This is exactly the problem Level 2's session/JWT lessons and Level 5's caching lessons solve properly (externalize the state) rather than papering over with routing tricks.
- **Health check false positives from a shallow `/health` endpoint**: a `/health` route that only checks "is the process running" rather than "can this process actually serve requests" (e.g., it doesn't check its database connection) will keep an effectively broken backend in rotation — a very common, very real production incident pattern.
- **Thundering herd on backend-set change**: naive load balancing algorithms remapping large fractions of traffic when a backend is added/removed (the exact problem consistent hashing and Maglev are built to minimize) can cause a sudden, correlated spike of cache misses or connection churn.

## 9. Common misconceptions

- **"Load balancers just round-robin."** Round robin is one option among several with real, different failure modes and appropriateness — least-connections, consistent hashing, and Maglev-style approaches exist specifically because round robin's assumptions (uniform request cost, stable backend set) often don't hold in production.
- **"A reverse proxy and a load balancer are different pieces of infrastructure."** A load balancer *is* a reverse proxy — specifically one whose primary job is backend selection. The same software (Nginx, HAProxy, Envoy) typically does both jobs at once.
- **"L7 load balancing is strictly better since it's smarter."** It's strictly more expensive per request and lower-throughput per node — which is exactly why high-volume production architectures put a cheap L4 tier in front of a smarter but costlier L7 tier, rather than running L7 everywhere.

## 10. Trade-offs

L4: high throughput, low latency, no content-awareness. L7: content-aware routing (path/header/cookie-based), TLS termination, but real added latency and lower per-node throughput. Consistent/Maglev hashing: solves churn and even-distribution problems that simpler algorithms have, at the cost of real implementation complexity you almost never build yourself — you consume this via your load balancer/CDN provider's implementation, but understanding it is what lets you reason correctly about behavior during a backend pool resize.

## 11. Real-world applications

- API gateways (a specialized L7 reverse proxy, often with added concerns like auth, rate limiting — Level 2) are the front door to almost every production microservice architecture (Level 8).
- CDN edge nodes are, functionally, geographically distributed reverse proxies making L7 (and sometimes L4/anycast) routing decisions about which origin or cache to serve from.
- Cloud load balancer products (AWS ALB is L7, NLB is L4; GCP's global load balancer draws directly on Maglev's lineage) are direct, named implementations of everything in this lesson — this isn't academic vocabulary, it's the literal menu of options you pick from when provisioning infrastructure at Level 9.

## 12. Connections

Depends on Lesson 5 (HTTP semantics — L7 routing decisions are made on HTTP method/path/headers) and Lesson 6 (TLS — termination is a load-balancer-layer decision). Consistent hashing previewed here recurs at Level 7 (Distributed Systems, sharding) and Level 5 (Caching, distributed cache key routing) as the same underlying technique solving a structurally identical problem.

## 13. Practical exercise

Design (on paper) the load-balancing tier for an API with two backend pools: a fast, high-volume read pool and a slow, low-volume write pool that must never be starved by read traffic. Decide: L4, L7, or both layered? Which algorithm for each pool, and why — walk through what happens to your choice under a sudden 5x traffic spike and under one backend in the write pool silently degrading (still returns 200s, but slowly).

## 14. Challenge

Your team observes that whenever you deploy (removing old backend instances, adding new ones), a wave of Redis cache misses briefly spikes latency, even though the cache itself wasn't touched. Using this lesson's content on consistent hashing and Maglev, explain the most likely mechanical cause, and propose a load-balancing-algorithm-level fix.

## 15. Mastery test

- State precisely what an L4 load balancer can never route on, and why — not "it's less smart," but the specific mechanical reason.
- Explain why a plain `hash(key) % N` scheme is dangerous specifically when the backend pool count `N` changes, and what consistent hashing does differently to bound the damage.
- What specific problem does Maglev's fixed-size lookup table solve that generic consistent hashing under-optimizes for?
- Differentiate active and passive health checks precisely enough to explain a real scenario where only one of the two would catch a given failure.
