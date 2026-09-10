# Pagination — Offset, Keyset, and Cursor, and Why the "Simple" One Doesn't Scale

## 1. Why does this exist?

No API returns an unbounded result set in one response — that's both a payload-size problem (Module 1's bandwidth content) and, less obviously but more importantly, a database performance problem. This lesson is deliberately positioned right before Level 3 (Databases) because pagination is the first place a full-stack developer's API design decisions collide directly with database internals — the "obvious," simplest pagination approach has a specific, well-documented performance cliff that only becomes visible at scale, and understanding why requires a preview of how indexes actually work.

## 2. Mental model

**Offset pagination** is like being told "skip the first 4,999,980 people in this line, then hand me the next 20" — the person doing the counting still has to walk past every single one of those 4,999,980 people to know where the 20 you want start, even though they'll never actually look at most of them. **Keyset/cursor pagination** is like saying "give me the 20 people right after the one whose ticket number is #4,999,980" — the person doing the counting can jump directly to that ticket number without walking past anyone.

## 3. Simple explanation

- **Offset pagination** (`LIMIT 20 OFFSET 5000`): the database counts and discards the first `OFFSET` rows (in whatever order the query specifies) before returning the next `LIMIT` rows. Simple to implement, simple for clients to reason about ("give me page 251"), and — critically — its cost **grows with how deep into the result set you're paginating**, not with how many rows you're actually returning.
- **Keyset pagination** (`WHERE id > 4999980 ORDER BY id LIMIT 20`): instead of counting rows to skip, the query directly seeks to a specific position using the value of an indexed, ordered column from the last row of the previous page — no counting, no discarding.
- **Cursor pagination**: functionally the same mechanism as keyset pagination, but the client-facing API exposes an **opaque token** (a "cursor" — typically the keyset value, encoded/encrypted so the client can't inspect or manipulate it directly) instead of a raw column value. Cursor pagination *is* keyset pagination underneath, with an API-design layer on top hiding the implementation detail from clients.

## 4. Technical explanation

**Why offset pagination's cost genuinely grows with depth — this requires a small preview of how a database executes the query (Level 3 will cover indexes and B-trees in full depth; this is the minimum needed to understand this specific, real cliff):** even when the `ORDER BY` column is indexed (letting the database find a *starting point* quickly via the index), satisfying `OFFSET 99980` still requires the database to walk forward through 99,980 index entries, one at a time, discarding each, before it can start returning the 20 rows you actually asked for. This is fundamentally an **O(n)** operation in the offset depth — a documented real-world measurement shows a query like this scanning roughly 100,000 rows just to discard them, taking multiple seconds, purely because of how deep the offset was, even though the actual *returned* result set is tiny and the column is indexed. Doubling the offset roughly doubles this cost; there is no way to index your way out of it, because the cost isn't about *finding* a row, it's about *counting past* rows.

**Why keyset pagination's cost stays flat regardless of depth:** `WHERE id > 4999980 ORDER BY id LIMIT 20` gives the database's query planner a direct, indexed **seek** target — because the primary key (or whichever column you're paginating on) is a B-tree index (Level 3 previews this explicitly), finding "the first entry greater than 4999980" is a logarithmic-time tree traversal to a specific point, not a linear walk from the beginning. The cost of seeking to row 50 and the cost of seeking to row 5,000,000 are essentially **identical** — this is the entire performance argument for keyset over offset, made precise rather than hand-wavy.

**A second, independent problem with offset pagination that has nothing to do with performance — data consistency under concurrent writes:** offset pagination identifies "page 251" by *position*, not by *identity*. If a row is inserted or deleted between a client fetching page 1 and page 2, every subsequent row's position shifts — a client can end up seeing the same row twice (it shifted into the range they already "skipped past" differently than expected) or, worse, silently miss a row entirely (it shifted out of range before they got to that page). This is a real, common source of subtly wrong "infinite scroll" behavior — duplicate or missing items — that has nothing to do with a bug in your pagination code and everything to do with offset pagination's positional (not identity-based) semantics being fundamentally unstable under concurrent modification. Keyset pagination is immune to this specific problem: because it identifies "the next page" relative to a specific row's *value*, not its *position*, an insert or delete elsewhere in the table doesn't shift what "next" means relative to your cursor.

**What keyset pagination actually requires to work correctly (this is where its added complexity lives):** the `ORDER BY` clause and the `WHERE` clause's comparison must use the *exact same column(s), in the exact same order and direction*, and a composite index must cover that same column order — pagination on a non-unique column (e.g., `created_at`, where ties are possible) requires a compound key (`created_at, id`) to guarantee a stable, unambiguous ordering; using `created_at` alone can silently skip or duplicate rows that share an identical timestamp. This is a real, specific implementation discipline, not an optional nicety — getting it wrong produces bugs that look identical to offset pagination's consistency problems, just from a different root cause.

## 5. How it works internally

Run `EXPLAIN ANALYZE` (Level 3 will make this a core tool) on both an offset query at meaningful depth and an equivalent keyset query — the offset query's plan will show a much higher "rows removed by filter" or an explicit scan-then-skip pattern, while the keyset query's plan shows a direct **index scan** (or, ideally, an **index-only scan**) seeking straight to the target row. This is the concrete, visible artifact of the O(n)-vs-O(log n) difference described above — not an abstraction, something you can watch happen against a real table once Level 3 gives you the tooling vocabulary.

## 6. Example

```sql
-- Offset: cost grows with OFFSET depth, regardless of how indexed `id` is.
SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 99980;

-- Keyset: cost stays flat — a direct index seek to the boundary value.
SELECT * FROM orders WHERE id > 99980 ORDER BY id LIMIT 20;
```

## 7. Code

```ts
// Cursor pagination: the opaque token IS the keyset value, just
// base64-encoded so clients treat it as opaque rather than a raw ID
// they might be tempted to manipulate directly.
function encodeCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64url');
}
function decodeCursor(cursor: string): number {
  return Number(Buffer.from(cursor, 'base64url').toString());
}

async function getOrdersPage(cursor?: string, limit = 20) {
  const afterId = cursor ? decodeCursor(cursor) : 0;
  const rows = await db.query(
    `SELECT * FROM orders WHERE id > $1 ORDER BY id LIMIT $2`,
    [afterId, limit],
  );
  const nextCursor = rows.length === limit ? encodeCursor(rows[rows.length - 1].id) : null;
  return { rows, nextCursor };
}
```

## 8. Failure scenarios

- **Offset pagination silently degrading as a table grows**: an endpoint that felt instant during development against a few thousand rows becomes a multi-second query in production against millions — a real, common "worked in staging, times out in prod" incident class rooted entirely in this lesson's O(n) explanation.
- **"Jump to page N" UI features being fundamentally incompatible with keyset pagination**: keyset only supports "next"/"previous" relative to a known cursor — it cannot efficiently answer "show me page 500 directly" without effectively degrading back to an offset-shaped scan. This is a genuine product/engineering trade-off worth surfacing explicitly rather than discovering after committing to a UI design.
- **Keyset pagination on a non-unique, unindexed, or incorrectly composite-ordered column** — silently skips or duplicates rows sharing a tie value, exactly the consistency bug keyset pagination is supposed to avoid, reintroduced by an implementation shortcut.

## 9. Common misconceptions

- **"Adding an index to the sorted column fixes offset pagination's performance."** It helps the database find the *starting point* faster but does nothing about the fundamental O(n) cost of walking past `OFFSET` rows to discard them — this is the single most common incorrect "fix" attempted for this problem.
- **"Cursor and keyset pagination are different techniques."** Cursor pagination is keyset pagination with an opaque token wrapping the same underlying mechanism — worth naming precisely rather than treating as two unrelated options, since conflating "cursor" with something exotic obscures that its performance story is identical to plain keyset.
- **"Offset pagination is always the wrong choice."** For low-volume tables, admin interfaces, or contexts genuinely needing arbitrary "jump to page N" access, offset pagination is simple and entirely adequate — the crossover point where its cost becomes a real problem is usually cited around hundreds of thousands of rows or deep-scrolling access patterns (infinite scroll, API pagination through large result sets), not universally.

## 10. Trade-offs

Offset: simple, supports arbitrary page-jumping, degrades badly with depth, unstable under concurrent writes. Keyset/cursor: flat performance regardless of depth, stable under concurrent writes, cannot support arbitrary page-jumping, requires more careful implementation (composite ordering discipline).

## 11. Real-world applications

- Every major API with genuinely large collections (GitHub's API, Stripe's list endpoints, Twitter/X's timeline) uses cursor-based pagination for exactly the reasons in this lesson — infinite-scroll-shaped access patterns at scale are precisely where offset pagination's cliff is unacceptable.
- Internal admin dashboards showing "page 1 of 40" over a small table are a legitimate, common place offset pagination remains the right, simpler choice — this lesson isn't an argument for keyset pagination unconditionally everywhere.

## 12. Connections

Directly previews Level 3 (Databases) — this lesson is deliberately the first place index/B-tree seek-vs-scan behavior is introduced, ahead of its full treatment, because pagination is the API-design decision most directly and measurably shaped by that underlying database mechanism. Connects to Lesson 1 (API design/versioning — a pagination strategy is part of your uniform interface's contract with clients, and changing it later is a breaking change).

## 13. Practical exercise

Design the pagination contract for a `GET /orders` endpoint expected to eventually hold tens of millions of rows, used primarily for an infinite-scroll UI. Decide the ordering column(s), whether ties are possible and how you'd resolve them, and what the cursor actually encodes.

## 14. Challenge

A product manager insists on a "jump to page 500" feature for an endpoint you've built with keyset pagination for performance reasons. Propose a real, concrete resolution — not a hand-wave — that satisfies the product requirement without reintroducing the O(n) offset cliff for the common (non-jumping) case.

## 15. Mastery test

- Explain precisely why offset pagination's cost grows with `OFFSET` depth even when the sorted column is indexed — what specifically is the database doing that indexing doesn't help with?
- Construct a concrete scenario (a specific sequence of inserts/deletes and page fetches) where offset pagination causes a client to see a duplicate row, and explain why keyset pagination wouldn't have the same problem.
- Explain why keyset pagination on a non-unique column requires a composite key ordering, and what goes wrong if you skip that.
- State the specific product/UX capability keyset pagination gives up relative to offset pagination, precisely.
