# TLS & HTTPS — What the Handshake Actually Costs

## 1. Why does this exist?

Plain HTTP (Lesson 5) over plain TCP (Lesson 2) is sent in the clear — anyone on the network path (a router, a Wi-Fi hotspot operator, an ISP) can read or modify it. TLS (Transport Layer Security) sits between TCP and HTTP to provide **confidentiality** (nobody can read it), **integrity** (nobody can tamper with it undetected), and **authentication** (you're actually talking to who you think you are, not an impostor). HTTPS is just "HTTP running over TLS."

## 2. Mental model

Before any HTTP conversation happens, both sides run a much shorter conversation whose entire purpose is: agree on a shared secret encryption key, without ever sending that key in the clear, and confirm the server is who it claims to be (via a certificate signed by someone the client already trusts). Once that's done, everything after is just normal HTTP, encrypted.

## 3. Simple explanation

TLS uses **asymmetric cryptography** (public/private key pairs) briefly, at the start, to safely establish a **symmetric key** — then switches to symmetric encryption (much faster) for the actual data. This hybrid approach exists because asymmetric crypto is computationally expensive; you use it only for the minimum needed (agreeing on a secret and verifying identity), then use cheap symmetric encryption for the bulk of the conversation.

## 4. Technical explanation

**Certificate chain of trust:** a server presents a certificate containing its public key, signed by a Certificate Authority (CA). Your OS/browser ships with a list of CAs it already trusts. If the certificate is signed by one of those (directly or through an intermediate that chains back to one), the client trusts the server's identity claim. This is why a self-signed certificate triggers a browser warning — there's no trusted party vouching for it.

**TLS 1.2 handshake (older, still common enough to know):** roughly **2 additional round trips** beyond the TCP handshake before application data can flow — client and server negotiate a cipher suite, exchange certificates, verify, and derive keys.

**TLS 1.3 handshake (current standard, RFC 8446):** cut down to **1 round trip** for a full handshake, and supports **0-RTT resumption** for a client reconnecting to a server it's talked to recently (using a previously established session ticket) — meaning application data can be sent in the *very first* packet of a resumed connection, at the cost of some replay-attack considerations for that first 0-RTT data specifically (which is why 0-RTT data is typically restricted to idempotent requests only — a direct callback to Lesson 5's idempotency semantics: a `GET` replayed by an attacker who captured and resent the 0-RTT packet is harmless in a way a replayed `POST /payments` would not be).

**The key schedule, precisely (this is the part usually skipped, and it's what actually explains "why is it fast" and "why is it forward-secret"):** TLS 1.2 derived keys via a single PRF construction; TLS 1.3 replaces this with a layered chain built entirely on **HKDF** (HMAC-based Key Derivation Function, RFC 5869), which has two primitive operations — `HKDF-Extract` (concentrate a possibly-non-uniform input, such as a Diffie-Hellman shared secret, into a fixed-length, uniformly-random pseudorandom key) and `HKDF-Expand` (stretch that pseudorandom key into as much context-specific key material as a given phase of the handshake needs). The schedule runs through three sequential secrets, each an `HKDF-Extract` over the previous stage's output plus new input keying material:
1. **Early Secret** — derived via `HKDF-Extract` using a PSK (pre-shared key, from a prior session's resumption ticket) if one exists, or a zero-filled input otherwise. This is what makes 0-RTT possible — the client can derive an *early traffic key* from this alone, before any fresh key exchange with the server, and start sending encrypted application data immediately.
2. **Handshake Secret** — derived by feeding the (EC)DHE shared secret from *this specific handshake's* ephemeral key exchange into `HKDF-Extract`, salted by the Early Secret. From this, both sides derive the client/server **handshake traffic secrets**, which encrypt the rest of the handshake itself (certificate, its verification) — a property TLS 1.2 didn't have, where more of the handshake was sent in the clear.
3. **Master Secret** — derived from the Handshake Secret (with the DHE input now zeroed out, since its job is done), and from it, both sides derive the client/server **application traffic secrets** that encrypt actual HTTP data, plus a separate **resumption master secret** used to generate the session ticket for a *future* connection's 0-RTT.

**Forward secrecy, and why TLS 1.3 mandates it structurally, not just by convention:** TLS 1.2 permitted cipher suites built on **static RSA** key exchange, where the "shared secret" was just encrypted directly with the server's long-lived public key — meaning if that private key was ever compromised, an attacker holding recordings of *past* traffic could decrypt all of it retroactively. TLS 1.3 removed static RSA and static (non-ephemeral) Diffie-Hellman from the protocol entirely — every handshake's Handshake Secret is now derived from a **freshly generated, ephemeral** (EC)DHE key pair, used once and then discarded. Compromising the server's long-term certificate private key (which only ever signs, in TLS 1.3, rather than directly wrapping the shared secret) does not let an attacker retroactively decrypt captured traffic from past sessions — each session's actual encryption keys die with that session. This is what "forward secrecy" concretely means, and TLS 1.3 is the first version where it's not optional.

**Total connection cost, stacked (this is the part that's usually invisible until you measure it):** TCP handshake (1 RTT) + TLS handshake (1 RTT with TLS 1.3, more with 1.2) *before* the actual HTTP request is even sent. On a connection with 100ms RTT (not unusual for cross-continent traffic), that's 200ms+ of pure setup latency before your server even sees the request — which is exactly why **connection reuse** (keep-alive, Lesson 9) and **session resumption** matter so much for real-world API latency, and why "just add more bandwidth" (Lesson 9) does nothing for this cost.

**Session resumption:** once a TLS session is established, both sides can cache enough state (a session ticket) to skip the full handshake on a subsequent connection — this is a major, concrete reason persistent/reused connections beat fresh ones, independent of TCP's slow start (Lesson 2).

## 5. How it works internally

1. TCP handshake completes first (Lesson 2) — TLS runs *on top of* an already-established TCP connection, it doesn't replace it.
2. `ClientHello`: client proposes TLS version, supported cipher suites, a random value.
3. `ServerHello` + certificate: server picks a cipher suite, sends its certificate (containing its public key) and its own random value.
4. Client verifies the certificate chain against its trusted CA list.
5. Both sides derive a shared symmetric key using a key-exchange algorithm (commonly Diffie-Hellman variants), using the exchanged randoms and, notably, **without ever transmitting the symmetric key itself over the wire** — this is the core trick that makes eavesdropping on the handshake useless to an attacker.
6. From here on, all HTTP data is encrypted with that symmetric key.

## 6. Example

```
curl -v https://api.github.com 2>&1 | grep -A2 "TLS"
```
or, more precisely, use your browser's Network tab on any HTTPS request and look at the timing breakdown — you'll typically see distinct "DNS," "Connecting" (TCP), "TLS," and "Waiting (TTFB)" phases. That breakdown is this lesson and Lessons 1, 2, and 4, made visible in one screenshot.

## 7. Code

Node's `https` module exposes TLS connection details directly:
```js
import { request } from 'node:https';

const req = request('https://api.github.com', (res) => {
  const socket = res.socket;
  console.log('TLS protocol:', socket.getProtocol());        // e.g. 'TLSv1.3'
  console.log('Cipher:', socket.getCipher());
  console.log('Session reused:', socket.isSessionReused());  // resumption in action
  res.resume();
});
req.end();
```

## 8. Failure scenarios

- **Certificate expiry**: an expired cert causes every client to reject the connection outright — a full, sudden outage that has nothing to do with your application code, and a genuinely common real-world incident category. This is a direct preview of Level 9/10 (cert lifecycle, monitoring for expiry before it happens).
- **Certificate chain misconfiguration**: server sends its cert but not the intermediate CA cert needed to complete the chain — works in some clients (that have the intermediate cached) and fails mysteriously in others.
- **Downgrade/mismatch**: client and server can't agree on a mutually supported TLS version/cipher — connection fails, sometimes with an unhelpful error.
- **Clock skew**: certificate validity checks depend on both sides having roughly correct system time — a server with a badly wrong clock can reject valid certificates.

## 9. Common misconceptions

- **"HTTPS is slow because encryption is expensive."** Symmetric encryption (the bulk of the conversation) is cheap on modern hardware — the real cost is the handshake's *round trips*, not the cryptographic computation itself. This is why the fix is connection reuse and TLS 1.3/0-RTT, not "use weaker encryption."
- **"A valid certificate means the server is trustworthy/not malicious."** It only means the CA verified domain (or organization) control — it says nothing about the server's intent or security posture.
- **"TLS and SSL are the same thing, just different names."** SSL is TLS's deprecated predecessor with known vulnerabilities — "SSL certificate" is common colloquial shorthand but the actual protocol in use should always be TLS.

## 10. Trade-offs

TLS adds real, physical round-trip latency to connection setup (mitigated but not eliminated by TLS 1.3 and resumption) and modest CPU cost, in exchange for confidentiality, integrity, and authentication that plaintext HTTP simply cannot provide. There's no real production scenario anymore where skipping TLS for a public-facing API is an acceptable trade — the cost has dropped enough (TLS 1.3, cheap modern crypto hardware) that this is no longer a close call the way it may have been discussed a decade ago.

## 11. Real-world applications

- CDNs and load balancers (Lesson 8) commonly do **TLS termination** — the CDN/LB holds the certificate and decrypts traffic at the edge, then talks to your origin servers over plain HTTP or a separate internal TLS connection — a real architectural pattern you'll design around at Level 9.
- Certificate rotation/renewal automation (e.g., Let's Encrypt + ACME) exists specifically because manual cert management is a reliable source of expiry-related outages.

## 12. Connections

Sits directly on top of Lesson 2 (TCP — TLS assumes a TCP connection already exists) and directly motivates Lesson 9 (connection reuse — TLS handshake cost is a second, independent reason beyond TCP's own handshake/slow-start to keep connections alive). Sets up Level 11 (Security) — encryption in transit is one piece of a much larger security surface.

## 13. Practical exercise

Using your browser's Network tab, load a page from an API you use regularly and inspect the timing breakdown for the first request vs. a subsequent request to the same host. Identify which phases shrink or disappear on the second request, and connect each change back to something in this lesson (session resumption) or Lesson 2 (avoided TCP handshake + slow start) or Lesson 9 (connection reuse).

## 14. Challenge

Your API serves clients globally, and mobile clients on high-latency networks report the first request after app launch feels sluggish, even though your server processes it in under 20ms. Using everything from Lessons 1–4 and this lesson, list every layer of round-trip cost stacked before your server even sees the request, and propose what's actually fixable vs. what's physics.

## 15. Mastery test

- Explain precisely why TLS uses asymmetric crypto only briefly and switches to symmetric — what would go wrong (practically, not just "it'd be slow") if it used asymmetric crypto for the whole conversation?
- What does TLS session resumption actually skip, and why does that matter for a client making repeated requests to the same API?
- If a certificate is technically valid (not expired, correct chain) but the server has been compromised, what does TLS protect you from, and what does it explicitly not protect you from?
- Walk the TLS 1.3 key schedule from Early Secret to application traffic keys, naming what new input keying material each `HKDF-Extract` step consumes.
- Explain forward secrecy specifically in terms of what changed between TLS 1.2's static RSA suites and TLS 1.3's mandatory ephemeral (EC)DHE — what exactly can an attacker who steals the server's certificate private key *not* do under TLS 1.3 that they could under TLS 1.2's static-RSA mode?
- Why is 0-RTT data specifically vulnerable to replay in a way the rest of the TLS 1.3 handshake isn't, and why does that make it a bad idea to serve a non-idempotent endpoint over 0-RTT?
