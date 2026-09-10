# IP & Packets

## 1. Why does this exist?

Every backend system you'll ever build eventually reduces to: bytes need to move from one machine to another, over infrastructure neither machine controls, that can lose, delay, duplicate, or reorder those bytes. IP is the layer that makes "address a machine and hand it some data" possible across a network of networks — without it, TCP, HTTP, your REST API, none of it has anything to run on top of.

## 2. Mental model

Think of IP as the postal system, not a phone call. Every packet is an envelope with a destination address, dropped into the network independently. No envelope knows about any other envelope. No envelope is guaranteed to arrive, arrive once, or arrive in order. Routers are post offices that only know "which direction gets this closer to its destination," not the whole route.

## 3. Simple explanation

Data you send over the internet gets broken into chunks called **packets**. Each packet gets an **IP header** slapped on it containing a source address and destination address. Routers along the way look only at the destination address and forward the packet toward it, one hop at a time. That's it — IP's job is addressing and routing, nothing else. It does not guarantee delivery, order, or that duplicates won't happen.

## 4. Technical explanation

- **IPv4** addresses are 32-bit (e.g., `192.168.1.1`), giving ~4.3 billion addresses — exhausted for public allocation years ago, which is why NAT (Network Address Translation) exists: your home router has one public IP and maps many private IPs (`192.168.x.x`, `10.x.x.x`) behind it.
- **IPv6** addresses are 128-bit (e.g., `2001:db8::1`), solving exhaustion, but adoption is still partial — backend systems generally need to handle both.
- IP is a **best-effort, connectionless, unreliable** protocol by design. "Unreliable" here is a technical term, not a criticism — it means IP itself makes no promises about delivery. Reliability is deliberately pushed up to TCP (Lesson 2), because not every use case wants that overhead (see UDP, Lesson 3).
- A packet's **TTL (Time To Live)** field prevents infinite routing loops — each router decrements it, and a packet whose TTL hits zero is dropped. This is literally how `traceroute` works: it sends packets with increasing TTLs and watches which router reports "expired" at each hop.
- **MTU (Maximum Transmission Unit)** — a packet can only be so large before it must be fragmented. This matters in practice: it's why certain payload sizes trigger fragmentation-related latency or drops on some networks, a real source of "works on my machine, times out over VPN" bugs.

## 5. How it works internally

When your Node process calls `fetch('https://api.example.com')`:
1. The OS network stack breaks the outgoing data into packets, each ≤ MTU.
2. Each packet gets an IP header (source IP, destination IP, TTL, protocol number indicating "the next layer is TCP").
3. Your machine doesn't know the full path to the destination — it only knows its **default gateway** (your router). It hands the packet there.
4. Each router along the path consults a routing table, decides the next hop, forwards. This repeats across potentially a dozen+ hops (ISPs, backbone providers, the destination's network) — no single router knows the whole path.
5. Packets can take *different routes* to the same destination and arrive out of order, or not at all. IP does not fix this — whatever's above IP (usually TCP) has to.

## 6. Example

Run this to see actual hops between your machine and a real API:
```
traceroute api.github.com    # macOS/Linux
```
Each line is a router (a "hop") that decremented the TTL and sent back an ICMP "time exceeded" message. The jump in latency between hops is real, physical distance and queuing — this is the raw material that "why is my API slow" debugging eventually comes down to.

## 7. Code

You don't usually touch IP directly in backend code — it's below the abstraction level of `http.createServer` or NestJS. But you can see it:
```js
import { createConnection } from 'node:net';

const socket = createConnection({ host: 'api.github.com', port: 443 }, () => {
  console.log('Local address:', socket.localAddress, socket.localPort);
  console.log('Remote address:', socket.remoteAddress, socket.remotePort);
  socket.end();
});
```
`socket.remoteAddress` here is the resolved IP — DNS (Lesson 4) already ran before this connection could even start.

## 8. Failure scenarios

- **Packet loss**: a router drops a packet (congestion, faulty hardware, wireless interference). IP does nothing about it — no retransmission, no notification to the sender.
- **Packet reordering**: two packets from the same stream take different routes and arrive out of order. IP does not reorder them.
- **Duplicate packets**: rare but possible (e.g., a retransmission at a lower layer plus the original both arriving). IP does not deduplicate.
- **MTU black holes**: a packet needs fragmenting, but a misconfigured firewall blocks the ICMP message that would normally signal this — the connection just hangs. A real, nasty production bug class.

## 9. Common misconceptions

- **"The internet is one network."** It's a network *of* networks (autonomous systems) that agree to route traffic for each other via BGP. There's no single map of the whole thing anywhere.
- **"My request takes one path there and back."** Not guaranteed — asymmetric routing is common and normal.
- **"IP handles reliability."** It explicitly does not. That's the entire reason TCP exists as a separate layer.

## 10. Trade-offs

IP's statelessness and lack of guarantees are a *feature*, not an oversight: it keeps routers simple and fast (they don't track connection state, just forward packets), which is exactly what let the internet scale to its current size. The cost is pushed upward — anything needing reliability, ordering, or flow control has to build it on top (TCP), and anything that doesn't need those things gets to skip that cost (UDP).

## 11. Real-world applications

- CDN routing (Cloudflare, Fastly) relies on IP-layer anycast — the same IP address is announced from many locations, and BGP routing sends you to the nearest one.
- Debugging "requests from this region are slow" often starts with `traceroute`/`mtr` to find which hop is adding latency.
- NAT and private IP ranges are why your Docker containers (Level 9) have internal IPs that aren't reachable from outside without explicit port mapping.

## 12. Connections

This is the floor everything else in Level 1 sits on: TCP (Lesson 2) adds reliability on top of IP's best-effort delivery. DNS (Lesson 4) exists because IP addresses aren't human-friendly. Load balancers (Lesson 8) at Layer 4 operate directly on IP/port information.

## 13. Practical exercise

Run `traceroute` (or `mtr` if installed) from your machine to three different real API endpoints (e.g., an API you use, a CDN-hosted site, something hosted in a different continent if you can find one). Compare hop counts and latency jumps. Write down: which hop had the single biggest latency increase in each trace, and what's your hypothesis for why?

## 14. Challenge

Your production API, hosted in one cloud region, serves users on three continents. Support tickets say "slow" but only from one specific region. Without access to APM tooling yet (that's Level 10), what's the first network-layer thing you'd check, and what would distinguish "this is an IP-routing/distance problem" from "this is an application problem"?

## 15. Mastery test

- Explain, without saying "it just routes packets," *why* a router doesn't need to know the full path to a destination.
- Why is packet reordering possible even between two machines with a stable connection?
- What does TTL prevent, and what does it cost you as a debugging signal (i.e., what tool is built entirely around watching TTL expire)?
