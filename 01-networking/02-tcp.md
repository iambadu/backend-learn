# TCP — Handshake, Reliability, Congestion Control, Ports & Sockets

## 1. Why does this exist?

IP (Lesson 1) gives you best-effort, unordered, unreliable packet delivery. Almost nothing you want to build tolerates that directly — you want "send this data, get it delivered, in order, exactly once, and slow down if the network can't keep up." TCP is the layer that manufactures those guarantees on top of an unreliable substrate. Every REST API call, every database connection, every `fetch()` you've ever written rides on TCP (unless it's explicitly UDP-based, like HTTP/3 — Lesson 7).

## 2. Mental model

TCP is a phone call built on top of a postal system. Before either side says anything meaningful, there's a ritual to establish "we're both here, we both agree to talk" (the handshake). Once connected, every piece of data sent gets numbered and acknowledged — if the receiver doesn't confirm receipt, the sender assumes it got lost and resends it. And critically: TCP doesn't blast data at full speed immediately — it starts cautious and speeds up only as it confirms the network can handle it, backing off sharply the moment it detects trouble. That's congestion control.

## 3. Simple explanation

TCP is a **connection-oriented, reliable, ordered, byte-stream** protocol. "Connection-oriented" means there's an explicit setup (handshake) and teardown. "Reliable" means lost packets get retransmitted. "Ordered" means the receiving application sees bytes in the order they were sent, even if the underlying IP packets arrived out of order — TCP buffers and reassembles them. "Byte-stream" means TCP doesn't preserve message boundaries; it's just a continuous flow of bytes (this is why `net.Socket` `data` events in Node can hand you a partial or merged chunk of what you "sent" as separate writes — a very common bug source for people who assume one `write()` = one `data` event).

## 4. Technical explanation

**The three-way handshake:**
1. Client → Server: `SYN` (synchronize), with an initial sequence number.
2. Server → Client: `SYN-ACK` (acknowledges client's SYN, sends its own SYN with its own sequence number).
3. Client → Server: `ACK` (acknowledges server's SYN).

Only after this completes can application data flow. This costs **one full round-trip time (RTT)** before your HTTP request can even be sent — this is why connection reuse (keep-alive, Lesson 9) matters so much: paying the handshake cost once and reusing the connection avoids repeating it per-request.

**Reliability mechanism:** every byte sent gets a sequence number. The receiver sends back ACKs indicating what it has received. If the sender doesn't get an ACK within a timeout, it retransmits. Sequence numbers also let the receiver reorder out-of-order packets before handing bytes to the application.

**Congestion control (the part most backend engineers have never had to reason about explicitly):**

The textbook description — slow start doubles `cwnd` each RTT until a loss or threshold, then congestion avoidance grows it linearly (additive increase), and a loss triggers a multiplicative cut — describes **classic Reno-style AIMD** (Additive Increase, Multiplicative Decrease). That's the mental model worth having, but it is *not* what's actually running on the servers you deploy to today, and the distinction has real performance consequences.

- **CUBIC** has been the default congestion-control algorithm on Linux since kernel 2.6.19 (2006), and is also the default on Windows (Server 2016+/Windows 10+) and macOS/iOS (10.12+) — meaning it's almost certainly what every one of your production servers and your database's TCP connections are running right now. CUBIC replaces Reno's straight-line additive increase with a **cubic growth function** of `cwnd` over *time since the last loss event* (not RTT count) — it grows aggressively right after backing off, then flattens out as it approaches the window size where the last loss occurred (probing for whether more capacity is now available), then grows aggressively again past that point. This makes CUBIC far less sensitive to RTT than Reno (Reno's growth rate is RTT-bound, which unfairly penalizes long-distance/high-RTT connections — the exact "fast and long-distance networks" problem CUBIC was designed for and codified in **RFC 9438**, which in 2023 moved CUBIC to full Internet Standards Track, obsoleting the earlier informational RFC 8312).
- CUBIC, like Reno, is fundamentally **loss-based**: it keeps increasing the sending rate until a packet is actually dropped, treating loss as the only congestion signal. This has a real cost — on a path with a large, poorly managed router buffer, CUBIC will keep filling that buffer before backing off, driving up queuing delay for everyone sharing that link even though throughput looks fine. This phenomenon has a name: **bufferbloat**.
- **BBR** (Bottleneck Bandwidth and Round-trip propagation time), developed at Google and increasingly deployed (including as an option on Linux, and used internally by Google's own services and CDN-adjacent infrastructure), takes a fundamentally different, **model-based** approach: instead of waiting for loss, it actively measures the connection's estimated bottleneck bandwidth (`BtlBw`) and minimum round-trip propagation time (`RTprop`), and paces sending to operate at the bandwidth-delay product — the theoretical point of maximum throughput with minimum standing queue. BBR cycles through explicit phases (`STARTUP`, `DRAIN` — deliberately shedding the queue it built up during startup, `PROBE_BW`, `PROBE_RTT`) rather than reacting only to loss. In practice this means BBR tends to sustain **meaningfully lower queuing delay** than CUBIC on the same path (CUBIC persists in keeping the buffer full; BBR actively drains it), and BBRv3 has shown throughput gains up to ~30% over CUBIC on high-bandwidth-delay-product paths with shallow buffers — but BBR is not a strict upgrade: on paths with genuine (non-congestive) random loss, or when competing directly against loss-based CUBIC flows for the same bottleneck buffer, BBR's fairness behavior is an active area of debate and tuning (BBRv3 specifically targets some of the fairness complaints leveled at BBRv1).
- **Practical consequence for you as a backend engineer:** which algorithm your server's kernel is running is a real, measurable lever on tail latency for geographically distant clients — it's a knob (`net.ipv4.tcp_congestion_control` on Linux) that exists below your application code entirely, invisible in your NestJS logs, and it is a legitimate answer to "why do our p99 numbers look worse for users in a specific region" that has nothing to do with your database or your code.
- **Independent of which algorithm runs:** a brand-new TCP connection is *slower* than a long-lived one, because — under either CUBIC or BBR's `STARTUP` phase — the connection starts cautious and ramps up over multiple round trips rather than sending at full capacity immediately. This is a second, distinct reason (beyond handshake RTT) that connection reuse matters for latency-sensitive APIs, and it compounds with TLS session resumption (Lesson 6) rather than replacing it.

**Nagle's algorithm and delayed ACKs — a specific, real gotcha:** by default, TCP tries to batch small writes together before sending (Nagle's algorithm, to avoid flooding the network with tiny packets), and the receiver often delays sending an ACK for up to ~40-200ms hoping to piggyback it on outgoing data (delayed ACK). When both are enabled on opposite ends of a connection that sends small, latency-sensitive messages (exactly the shape of many RPC/API request patterns), they can interact to add tens to hundreds of milliseconds of pure, invisible latency per round trip. This is why `net.Socket#setNoDelay(true)` — disabling Nagle's algorithm — is a real, non-cosmetic setting for latency-sensitive Node servers, not a micro-optimization.

**Head-of-line blocking (TCP-level):** because TCP guarantees in-order delivery to the application, if packet #3 of 10 is lost, packets #4–10 sit in the receiver's buffer *unusable* until #3 is retransmitted and arrives — even though the bytes are physically present. This single fact is the reason HTTP/2's multiplexing (many logical streams over one TCP connection) can stall entirely on a single lost packet, and is the specific problem HTTP/3 was built to solve (Lesson 7).

**Ports and sockets:** an IP address identifies a *machine*; a port identifies a specific *process/service* on that machine (0–65535). A **socket** is the OS-level combination of `(local IP, local port, remote IP, remote port, protocol)` — this 4-tuple (well, 5 with protocol) is how the OS demultiplexes incoming packets to the correct application. This is also why a server can handle thousands of simultaneous connections on port 443: each client connection is a distinct socket because the *remote* IP/port differs, even though the *local* port (443) is the same for all of them.

## 5. How it works internally

When your NestJS server calls `app.listen(3000)`, the OS opens a **listening socket** bound to `(0.0.0.0, 3000)`. For each incoming connection:
1. The OS kernel completes the three-way handshake (this happens below your application code, in the kernel's TCP stack).
2. A new **connected socket** is created for that specific client, with the full 4-tuple.
3. Your Node event loop gets notified (via epoll/kqueue under the hood) that this socket is readable, and the `connection` event fires.
4. Data you `write()` gets buffered by the kernel's TCP send buffer, chunked into packets, sequenced, and sent — subject to the current congestion window.

## 6. Example

Watch a real handshake with `tcpdump` (or use your browser's Network tab and look at timing breakdown — the "Connecting" phase is the handshake):
```
sudo tcpdump -i any 'tcp[tcpflags] & (tcp-syn|tcp-ack) != 0' -n port 443
```
Make a request to any HTTPS API in another terminal and you'll see the SYN, SYN-ACK, ACK sequence.

## 7. Code

A raw TCP echo server, to see the layer HTTP is normally built on top of:
```js
import { createServer } from 'node:net';

const server = createServer((socket) => {
  console.log('New connection from', socket.remoteAddress, socket.remotePort);

  socket.on('data', (chunk) => {
    // NOTE: this may fire multiple times for one logical "message" the
    // client sent, or bundle multiple client writes into one chunk —
    // TCP has no concept of message boundaries. Framing is your job.
    socket.write(chunk); // echo back
  });

  socket.on('close', () => console.log('Connection closed'));
});

server.listen(4000);
```

## 8. Failure scenarios

- **Connection reset (RST)**: one side aborts abruptly (e.g., server crashed, or explicitly rejected). The other side gets `ECONNRESET` — a common error you've likely seen without necessarily knowing it's a TCP-level signal, not an application one.
- **Half-open connections**: a client's process dies without a clean TCP close (e.g., a laptop loses network entirely). The server doesn't immediately know — it can sit with a "connected" socket to a client that no longer exists until a timeout or a keep-alive probe fails. This is a real source of resource leaks in long-lived-connection systems (WebSockets, database connections).
- **SYN flood**: an attacker sends many SYNs without completing the handshake, exhausting the server's half-open connection table — a classic DoS vector, mitigated by SYN cookies.
- **Congestion collapse**: without AIMD's backoff behavior, a congested network segment would get *worse* under load as everyone retransmits more aggressively — TCP's whole congestion-control design exists to prevent this global failure mode, not just to be polite to one connection.

## 9. Common misconceptions

- **"TCP guarantees my message arrives as one write() = one read()."** False — it's a byte stream. Message boundaries are an application-layer concern (HTTP solves this with `Content-Length` or chunked encoding; you'd solve it yourself with framing in a raw protocol).
- **"A new connection is just as fast as a reused one, my server is just slow."** Not necessarily true — slow start alone can make a fresh connection meaningfully slower for the first several round trips, independent of server processing time.
- **"Increasing bandwidth fixes handshake latency."** No — the handshake cost is dominated by RTT (physical latency), not bandwidth. This distinction matters and gets its own lesson (Lesson 9).

## 10. Trade-offs

TCP's reliability and ordering guarantees are expensive: handshake RTT before any data flows, head-of-line blocking on loss, and congestion-control ramp-up that punishes short-lived connections. UDP (Lesson 3) exists precisely because some workloads (DNS queries, video streaming, HTTP/3's transport) don't want to pay this cost and can tolerate or handle loss/ordering themselves.

## 11. Real-world applications

- Every database connection (PostgreSQL, Redis) is a long-lived TCP connection — this is *why* connection pooling matters so much (Level 3/12): each new connection pays handshake + slow-start cost, so a pool of already-established connections is a real, measurable performance win, not just a resource-management nicety.
- API gateways and load balancers often terminate TCP/TLS and maintain their own pooled connections to backend services for exactly this reason.

## 12. Connections

Builds directly on Lesson 1 (IP) — TCP is what turns IP's best-effort delivery into something reliable. Everything in Lesson 5 (HTTP semantics) assumes a TCP connection already exists underneath it. Connection pooling here previews a theme that recurs at the database layer (Level 3) and the performance layer (Level 12).

## 13. Practical exercise

Using the raw TCP server above, write a client with `net.createConnection` that sends 5 separate `socket.write()` calls in a tight loop with no delay between them. Log what the server actually receives in its `data` handler — how many `data` events fire, and do they correspond 1:1 to the 5 writes? Explain the result using what this lesson taught about byte streams.

## 14. Challenge

Your API's p99 latency is dominated by "connection setup," not request processing, according to a trace you're given. List every TCP-layer (not application-layer) reason this could be true, and for each, what you'd check to confirm or rule it out.

## 15. Mastery test

- Why does a brand-new TCP connection start slow even on an uncongested network?
- Explain TCP head-of-line blocking well enough that someone could derive, without being told, why it's a problem for HTTP/2's stream multiplexing.
- What's the actual difference between what an IP address identifies and what a port identifies, and what identifies an individual connection?
- Explain the fundamental difference between how CUBIC and BBR decide when to slow down — one sentence per algorithm, precise enough that "they're both just AIMD" would be recognizably wrong.
- A high-bandwidth, high-latency connection between two data centers shows good throughput but consistently high queuing delay under load. Which congestion-control behavior does this symptom point to, and what would you check to confirm it?
