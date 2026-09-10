# UDP — and Why You'd Ever Choose Unreliable Delivery

## 1. Why does this exist?

TCP's guarantees (Lesson 2) aren't free — handshake RTT, in-order delivery causing head-of-line blocking, congestion-control ramp-up. Some workloads would rather have raw speed and handle loss themselves (or not care about it at all) than pay for guarantees they don't need. UDP is IP with almost nothing added — just enough to add ports. It exists because "reliable and ordered" is a *choice*, not a law of networking.

## 2. Mental model

If TCP is a phone call (connection, ordered conversation, "did you hear that?"), UDP is shouting a postcard into the wind. You write an address on it, throw it, and it either arrives or it doesn't — nobody tells you either way, and there's no ceremony beforehand.

## 3. Simple explanation

UDP (User Datagram Protocol) is **connectionless** (no handshake), **unreliable** (no retransmission, no delivery guarantee), and **unordered** (no sequencing, no reassembly guarantee). What it adds on top of raw IP is just port numbers (so multiple applications on one machine can each have their own UDP "channel") and a minimal checksum. That's it.

## 4. Technical explanation

Because UDP has none of TCP's machinery, sending a UDP datagram has effectively **zero setup cost** — no handshake RTT, no slow start. This makes it attractive for:
- **Latency-sensitive, loss-tolerant data**: a dropped video frame or a stale game-state packet is often better replaced by the *next* one than retransmitted late — TCP's insistence on delivering everything in order would make this worse, not better (a lost packet blocking everything behind it).
- **Simple request/response with the application handling retries itself**: DNS (Lesson 4) uses UDP for most queries — a query is one packet, a response is one packet, and if it's lost the resolver just retries after a timeout. No need for TCP's overhead for a single round trip.
- **Protocols that want to build their *own* reliability semantics** rather than inherit TCP's specific ones: this is exactly what **QUIC** (the transport under HTTP/3, Lesson 7) does — it runs over UDP and reimplements reliability, but per-stream, so one lost packet doesn't stall unrelated streams the way TCP's single ordered byte-stream does.

## 5. How it works internally

A UDP "connection" isn't one — there's no handshake, no state machine, no connection object at the protocol level (though your OS socket API still gives you a socket handle for convenience). Each `sendto()` is an independent datagram with a UDP header (source port, destination port, length, checksum) wrapped in an IP packet. The receiving application either gets it or doesn't; the OS makes no promise and does no retry.

## 6. Example

DNS over UDP, port 53, is the most common UDP traffic you generate without thinking about it — every time your app resolves a hostname (Lesson 4), that's (usually) a single UDP round trip.

## 7. Code

```js
import { createSocket } from 'node:dgram';

const server = createSocket('udp4');
server.on('message', (msg, rinfo) => {
  console.log(`Received from ${rinfo.address}:${rinfo.port}: ${msg}`);
});
server.bind(5000);

const client = createSocket('udp4');
client.send('ping', 5000, 'localhost');
// No confirmation this arrived. If you need one, you build it yourself
// (e.g., the server sends a reply datagram, and the client times out
// and retries if it doesn't get one within N ms).
```

## 8. Failure scenarios

- **Silent loss**: a datagram vanishes and *neither side is notified by the protocol*. If your application doesn't implement its own ack/retry, data is just gone.
- **No congestion control**: a naive UDP application blasting data as fast as possible can contribute to network congestion in a way TCP's AIMD is specifically designed to avoid — this is a real citizenship problem for UDP-based protocols at scale, which is why well-designed ones (QUIC included) implement their own congestion control rather than skipping it entirely.
- **Reordering and duplication**: both possible, both the application's problem if it matters.

## 9. Common misconceptions

- **"UDP is just TCP without reliability, so it's strictly worse."** It's not worse, it's a different trade-off — you're trading guarantees for the ability to define your own semantics and avoid paying for guarantees you don't need.
- **"Nobody serious uses UDP for anything beyond DNS/games."** HTTP/3 (Lesson 7), a mainstream production web transport, runs over QUIC over UDP specifically because TCP's guarantees were getting in the way at scale.

## 10. Trade-offs

**Choose UDP (or a UDP-based protocol) when:** loss tolerance is acceptable or you want custom reliability semantics, latency matters more than completeness, or per-stream independence matters (avoiding one lost packet stalling unrelated data).
**Choose TCP when:** you want "just make it reliable and ordered" without building that yourself, and per-connection overhead (one handshake, amortized over a long-lived connection) is acceptable.

## 11. Real-world applications

- DNS queries (mostly UDP, falls back to TCP for large responses — DNSSEC, zone transfers).
- Video/voice calls (loss-tolerant, latency-critical — a stale packet is worse than a dropped one).
- HTTP/3 / QUIC (Lesson 7) — the most relevant one for you as a backend engineer, because it directly affects how modern APIs and CDNs perform under real-world network conditions (mobile networks, packet loss).

## 12. Connections

Directly contrasts with Lesson 2 (TCP) — you can't evaluate UDP's trade-offs without already understanding what TCP is buying you. Sets up Lesson 4 (DNS, UDP-based) and Lesson 7 (HTTP/3 over QUIC/UDP).

## 13. Practical exercise

Using the code above, write a client that sends a UDP datagram and waits up to 500ms for a reply, retrying up to 3 times if none arrives, then giving up. You've just built a minimal reliability layer on top of UDP — which is conceptually close to what QUIC does, just far less sophisticated.

## 14. Challenge

A teammate proposes replacing your internal service-to-service HTTP calls (currently TCP-based REST) with a custom UDP protocol "for speed." Using this lesson and Lesson 2, what questions would you ask before agreeing, and what would have to be true about the workload for this to actually be a good idea?

## 15. Mastery test

- Explain why DNS defaults to UDP instead of TCP for most queries, in terms of what DNS actually needs.
- What does UDP hand you, exactly, compared to raw IP? (Be precise — it's a short, specific list.)
- Why doesn't "UDP has no congestion control" mean "UDP applications get to ignore congestion" in practice?
