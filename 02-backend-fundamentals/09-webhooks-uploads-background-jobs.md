# Webhooks, File Uploads & Background Jobs — Where Your API Stops Being Purely Request/Response

## 1. Why does this exist?

Everything so far in this module assumed a clean request-in, response-out cycle completing quickly. Three common, real patterns break that assumption in different directions: **webhooks** invert the direction entirely (someone else's server calls *you*, unprompted, and you must authenticate a caller you didn't initiate contact with); **file uploads** can involve payloads far too large to hold in memory as a single unit; and **background jobs** exist because some work is too slow to make a client wait for synchronously. This lesson is a foundational pass on all three — Level 6 (Asynchronous Processing) gives background jobs and queues their full, deep treatment; this is the API-design-layer version of the same ideas.

## 2. Mental model

A webhook is your API running in reverse — instead of you asking a question and getting an answer, someone else's system pushes a notification at you, and you have to be as suspicious of it as you'd want any inbound, unauthenticated caller to be, because by default that's exactly what it is. A streaming file upload is a garden hose, not a bucket — data flows through your server in a continuous stream and out to storage, rather than being collected into one giant bucket in memory before anything happens with it. A background job is a note you leave for a coworker (a queue) instead of interrupting your caller with "hold on while I finish this" (Level 6 covers who actually does that work and how it survives failure).

## 3. Simple explanation

**Webhooks**: a third-party service (a payment provider, a messaging platform) makes an HTTP `POST` to a URL *you* registered with them, whenever an event they're tracking occurs — your server is playing the role of "server" to their "client" for this one interaction, inverted from your usual API relationship with your own clients. **File uploads**: typically `multipart/form-data` encoded requests, where the body must be parsed incrementally (streamed) rather than loaded whole, for any file large enough that "just buffer it all in memory" becomes a real resource problem. **Background jobs**: work triggered by a request but not required to complete before that request returns a response — the request enqueues the work and returns quickly; something else (Level 6's workers) processes it later.

## 4. Technical explanation

**Webhook security — authenticating a caller who initiated contact with *you*, not the other way around, which is a fundamentally different trust posture than everything else in this module:** the standard mechanism is **HMAC signature verification** — the sender computes an HMAC (a keyed cryptographic hash, commonly HMAC-SHA256) over the raw request body using a secret both parties share (established out-of-band when you registered the webhook endpoint), and sends that signature in a header. Your server recomputes the same HMAC over the raw body it received using the shared secret, and confirms the two match before trusting the payload at all. Critically: **the comparison must use a constant-time comparison function**, not a naive `===`/string equality check — a naive comparison that returns as soon as it finds the first mismatched byte leaks, via response-timing differences, information about how many leading bytes of the guess were correct, which is a real, exploitable side channel (a **timing attack**) against signature verification specifically, not a theoretical concern.

**Replay protection — a second, distinct concern from tampering-detection, and why HMAC alone doesn't solve it:** a valid HMAC signature only proves the payload wasn't *altered* since it was signed — it says nothing about whether this exact, validly-signed request is being seen for the **first** time. An attacker who intercepts a legitimately signed webhook payload (or a malicious actor with prior legitimate access) can **replay** the identical request later, and it will pass signature verification perfectly, because nothing about the signature encodes *when* it's valid. The standard mitigation: include a **timestamp** in the signed payload (so the timestamp itself is covered by the HMAC and can't be altered without invalidating the signature) and reject requests whose timestamp falls outside a narrow acceptable window (commonly ~5 minutes) — bounding how long a captured, valid signature remains exploitable. A further, complementary layer many production systems add: track processed webhook/event IDs and reject (or idempotently no-op — directly connecting to Lesson 8) any ID already seen, closing the replay window down to zero rather than merely a few minutes.

**Multipart file uploads — why "just read `req.body`" breaks down, and what streaming actually buys you:** a naive upload handler that buffers an entire incoming file into memory before doing anything with it means memory usage scales directly with (file size × concurrent uploads) — a documented, concrete illustration: ten concurrent 500MB uploads, buffered naively, means 5GB of RAM consumed purely holding upload data in flight, before your server has done anything useful with any of it, a real, common cause of out-of-memory crashes under real (not even adversarial) load. A **streaming** multipart parser (e.g., `busboy` in the Node ecosystem, in contrast to `multer`'s default behavior of buffering to memory or disk before your code sees anything) processes the incoming request as a stream of chunks, letting you pipe each chunk directly to its final destination (disk, or more commonly in production, directly to object storage like S3) as it arrives — memory usage stays roughly constant regardless of file size, because you're never holding the whole file in memory at once.

**Backpressure — the mechanism that makes streaming actually safe, not just memory-efficient in the average case:** if the destination a stream is being piped to (disk I/O, an outbound network connection to object storage) is slower than the source producing data (the incoming upload), Node's stream `pipeline()` mechanism automatically **pauses** the source from producing more data until the destination catches up — rather than data piling up unbounded in an internal buffer while a slow consumer can't keep pace. This is the concrete, practical reason production upload code is written with `stream/promises`' `pipeline()` rather than manually wiring `.on('data', ...)` handlers — manual wiring is exactly where backpressure handling is easy to get wrong, silently reintroducing the unbounded-memory-growth problem streaming was supposed to solve in the first place.

**Background jobs — why "just enqueue it and move on" needs a specific consistency guarantee to actually be safe, previewing Level 6's transactional-outbox pattern:** a common, tempting-but-flawed implementation writes a database record (e.g., "order created") and then, as a separate step, publishes a message to a queue announcing that fact — but if the process crashes *between* those two steps (a real, non-hypothetical failure mode, not an edge case), you're left with a database record that exists but was never announced, or a published message pointing at a database write that never actually committed. The **transactional outbox pattern** solves this by writing the "event to be published" as a row in an `outbox` table, in the **same database transaction** as the actual business write — guaranteeing (via the database's own ACID transaction guarantee, Level 3) that either both happen or neither does. A separate process (or, in more sophisticated setups, a change-data-capture stream reading the database's own write-ahead log) then reads unpublished outbox rows and actually delivers them to the queue, marking them published once confirmed — this decouples "commit the fact this happened" (must be transactionally safe) from "notify whoever's downstream" (can tolerate being slightly delayed, and can be retried without corrupting the source-of-truth database state).

**A background job's worker must be written idempotent by default, not as an afterthought** — because real queueing systems (Level 6 covers delivery semantics in depth) overwhelmingly provide **at-least-once** delivery, meaning your worker code *will*, eventually, in production, receive the same job more than once (a worker crashing after processing but before acknowledging completion is the classic trigger) — this is precisely Lesson 8's idempotency-key concept, applied to asynchronous job processing instead of synchronous HTTP requests.

## 5. How it works internally

A NestJS webhook endpoint receiving, say, a payment-provider event: reads the **raw** request body (not the framework's already-JSON-parsed version — HMAC verification must operate on the exact bytes the sender signed, and re-serializing a parsed object can produce different bytes than the original, breaking verification for reasons that have nothing to do with an actual attack), recomputes the HMAC using the shared secret, compares in constant time, checks the embedded timestamp's freshness, and only then parses and acts on the payload — with the actual "act on it" step itself written to be safely retriable, since the provider's own retry behavior (Level 6) means you should expect to receive the same event more than once.

## 6. Example

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
```
`timingSafeEqual` is the concrete, standard-library answer to the timing-attack concern described above — using `===` or `Buffer.equals` here is the specific, common implementation mistake this lesson is warning against.

## 7. Code

Streaming a large upload directly to disk/object storage without buffering it whole:
```ts
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';

app.post('/upload', (req, res) => {
  const bb = busboy({ headers: req.headers });
  bb.on('file', async (name, fileStream) => {
    // pipeline() coordinates backpressure end-to-end: if the destination
    // (here, a placeholder writable — in production, an S3 upload stream)
    // is slower than the incoming request, fileStream is paused
    // automatically rather than buffering unbounded chunks in memory.
    await pipeline(fileStream, createWriteStream(`/uploads/${name}`));
  });
  req.pipe(bb);
});
```

## 8. Failure scenarios

- **Naive string-equality signature comparison** — a real timing-attack surface, not a hypothetical one, given HMAC comparison is exactly the kind of secret-dependent branch timing attacks target.
- **Verifying a webhook's HMAC over the framework's re-serialized/re-parsed body instead of the original raw bytes** — a very common implementation bug where valid, legitimately-signed webhooks fail verification because the JSON was reformatted (key order, whitespace) before signing was checked, producing byte-for-byte different content than what was actually signed.
- **A crashed process leaving an "orphaned" business write with no corresponding outbox event published** — exactly the inconsistency the transactional outbox pattern exists to prevent, and a real, common bug in systems that skip it in favor of "just publish right after the write."
- **A non-idempotent background job worker double-processing a redelivered job** — e.g., a job that sends a confirmation email being retried after a crash-before-acknowledgment sends the email twice, a direct, concrete real-world instance of Lesson 8's idempotency problem in an async context.

## 9. Common misconceptions

- **"A webhook payload is trustworthy because it came over HTTPS."** TLS (Module 1, Lesson 6) guarantees the request wasn't tampered with or read *in transit* — it says nothing about whether the sender is who they claim to be. HMAC signature verification is a separate, additional trust check specifically because "arrived over HTTPS" and "actually sent by the party I registered this webhook with" are different claims.
- **"Streaming uploads are only necessary for genuinely huge files."** The memory-multiplication problem (buffer size × concurrent uploads) means even moderate file sizes become a real problem purely from concurrency, not just from any single file being enormous.
- **"Enqueueing a background job and returning 200 immediately is inherently reliable because the queue handles retries."** The queue's retry guarantees only cover delivery *to your worker* — they say nothing about the consistency between your database write and the fact of the job being enqueued at all, which is exactly what the outbox pattern addresses.

## 10. Trade-offs

HMAC + timestamp + processed-ID tracking for webhooks: real implementation overhead for a genuinely necessary trust boundary, given webhooks are, by construction, unauthenticated inbound HTTP calls unless you add this yourself. Streaming uploads: more implementation complexity (stream composition, backpressure-aware code) than "just read the body," in exchange for memory usage that doesn't scale with file size or concurrency. The transactional outbox pattern: an extra table and a publishing worker, in exchange for a real consistency guarantee a naive "write then publish" approach cannot provide.

## 11. Real-world applications

- Every payment provider's webhook integration (Stripe, and directly relevant to Project 2 and 3) is built exactly on the HMAC-plus-timestamp-plus-idempotency pattern in this lesson — it's the industry-standard shape, not an unusual design.
- Cloud object storage (S3 and equivalents) upload flows in production almost universally stream directly from the client (via a pre-signed URL) or through a thin streaming proxy, specifically to avoid the memory-multiplication problem described here.
- The transactional outbox pattern is a named, standard building block you'll use directly in Project 3 (Notification Platform) and Level 6/7's messaging content.

## 12. Connections

Directly depends on Lesson 8 (idempotency — background-job redelivery is the async analogue of HTTP-request retries) and Module 1, Lesson 6 (TLS — this lesson's point about HTTPS not implying sender authenticity directly follows from understanding what TLS does and doesn't guarantee). Sets up Level 6 (Asynchronous Processing) in full, and Level 3 (transactions — the outbox pattern is a direct, concrete application of ACID guarantees this module has only previewed).

## 13. Practical exercise

Implement the HMAC verification function above, then write a test harness that sends a webhook payload with a correct signature but a stale (6-minutes-old) timestamp, and confirm your endpoint rejects it — then repeat with a fresh timestamp but a tampered payload, and confirm that's rejected too, for a different reason. Make sure your test can articulate which specific check caught each case.

## 14. Challenge

Design the notification-sending flow for Project 3: a business event occurs (e.g., "order shipped"), and this must reliably result in exactly one notification being enqueued for delivery, even across a process crash at any point in the flow. Sketch where the transactional outbox pattern fits, and where idempotency (Lesson 8) needs to reappear on the worker side.

## 15. Mastery test

- Explain precisely why TLS alone doesn't authenticate a webhook sender, and what HMAC verification adds that TLS doesn't provide.
- Explain the timing-attack risk in naive signature comparison well enough to state, generally, what property a "safe" comparison function needs to have.
- Walk through the specific inconsistency the transactional outbox pattern prevents, using a concrete crash-timing scenario where a naive "write, then publish" implementation fails.
- Explain why streaming a file upload with `pipeline()` prevents unbounded memory growth even when the upload destination is slower than the incoming request — what mechanism specifically is doing that work?
