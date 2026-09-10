# Diagnostic — Level 0 Foundations Check

Before Module 1 begins: a quick check on whether your existing Node.js/React intuition already clears Level 0 (Engineering Foundations), so we don't re-teach what you have and go straight to the gaps.

**Rules:** answer in your own words, don't look anything up. Say `check` when you've answered all of them (or answered what you can) and I'll tell you which ones exposed a real gap vs. which were solid — then we start Lesson 1.

1. Predict the exact console output order:
```js
console.log('a');
setTimeout(() => console.log('b'), 0);
Promise.resolve().then(() => console.log('c'));
console.log('d');
```
Explain *why* that order happens — name the two queues involved.

2. "Node.js is single-threaded, so it can't do concurrent work." True, false, or needs a distinction — and what distinction?

3. A request comes into your Node API and does `await db.query(...)`. While that query is in flight, is the Node process doing nothing, or is it doing something else? What, mechanically?

4. What's the difference between the stack and the heap, and which one overflows when you get "Maximum call stack size exceeded"?

5. You have a CPU-bound loop (e.g., hashing a large payload synchronously) inside a request handler. What happens to *every other* in-flight request on that Node process while it runs?

No answers given here — this is diagnostic, not instructional. Attempt all 5, then say `check`.
