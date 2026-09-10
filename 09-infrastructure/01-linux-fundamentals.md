# Linux Fundamentals — What's Actually Running Your Backend

## 1. Why does this exist?

Everything this curriculum has covered so far — a NestJS process, a Postgres backend process (Module 3, Lesson 9), a Redis instance (Module 5, Lesson 4) — is, at the operating-system level, just a Linux process contending for the same finite CPU, memory, and I/O as everything else on the machine. This lesson gives you the vocabulary and mental model for what's actually happening beneath every "server" abstraction you've used throughout this curriculum, and it's the direct, necessary prerequisite for understanding what a container (Lesson 2) actually is, rather than accepting "a lightweight VM" as good enough.

## 2. Mental model

A Linux machine is a single, shared apartment building, and every process is a tenant. Threads within one process are roommates sharing the same apartment (same address space, same resources); separate processes are tenants in separate apartments who can only interact through explicit, controlled channels (not by just walking through each other's walls) — this directly connects to Level 0's Node.js event-loop content, which described concurrency within one process; this lesson is about the layer below that, where the OS decides which processes (and their threads) actually get CPU time, and how much memory each is allowed.

## 3. Technical explanation

**Processes vs. threads, precisely — and why the distinction matters for reasoning about a backend service's actual resource footprint:** a **process** is an independent execution context with its own memory address space, its own file descriptors, and a unique PID — two processes cannot directly read each other's memory without an explicit, deliberate mechanism (shared memory, a socket, a file). A **thread** is a unit of execution *within* a process, sharing that process's address space and resources with every other thread in the same process — this is precisely why Module 3, Lesson 9 could state that each Postgres connection is a real, separate OS **process** (not a thread) — a deliberate Postgres architectural choice trading some per-connection memory overhead for genuine isolation between connections, versus a thread-per-connection model that would share memory more cheaply but with less isolation.

**Process memory layout — the concrete answer to "where does my process's memory actually live," worth knowing precisely since it explains real, common failure modes:** a process's virtual address space is divided into regions (VMAs — Virtual Memory Areas), each a contiguous range with consistent permissions and backing — code (the compiled program itself, read-execute), the **heap** (dynamically allocated memory, grows as your program allocates objects — this is where JavaScript's garbage-collected objects, referenced back in Level 0's content, actually live), and the **stack** (function call frames, local variables — this is precisely what overflows when Level 0's "Maximum call stack size exceeded" error occurs: too many nested function calls exhausting the stack region's fixed size). Virtual memory is a genuinely important indirection worth naming: a process's addresses aren't physical RAM addresses directly — the CPU's page tables translate virtual addresses to physical ones, which is what lets the OS give every process the illusion of its own private, contiguous address space even though physical RAM is shared and fragmented across many processes simultaneously.

**File permissions — the concrete, everyday mechanism you'll configure directly when deploying anything, worth being precise about rather than treating as a checkbox:** every file has an owner, a group, and permission bits for owner/group/others (read, write, execute) — a real, common, security-relevant mistake worth naming explicitly is `chmod 777` (granting read/write/execute to literally everyone), which defeats the entire purpose of permission-based access control and is a real, documented anti-pattern in production environments; the correct discipline is granting only the minimum permission actually required (directly echoing Level 11's eventual "least privilege" content, encountered here first at the filesystem level).

**Namespaces — the specific Linux kernel mechanism that makes Lesson 2's entire container model possible, worth understanding here at the OS level before Lesson 2 applies it:** a namespace partitions a specific kind of kernel resource so that one set of processes sees a completely different, isolated view of that resource than another set does, even though they're running on the same shared kernel. The specific namespace types worth knowing by name because they map directly onto what "containerizing" a process actually isolates: `CLONE_NEWPID` (a new process-ID namespace — processes inside see their own isolated process tree, unaware of processes outside it), `CLONE_NEWNET` (a new network namespace — its own network interfaces, routing table, effectively its own private network stack), `CLONE_NEWNS` (a new mount namespace — its own, isolated view of the filesystem hierarchy). This is the literal kernel-level mechanism Lesson 2 will show you Docker is built directly on top of — not a separate virtualization technology, the same Linux kernel feature any process can use directly.

## 4. How it works internally

When your NestJS process makes a network call, the kernel's scheduler decides when that process (or, more precisely, the specific thread making the call) actually gets CPU time to execute — and while waiting on I/O (Level 0's non-blocking I/O content, applied here at the OS level rather than the Node event-loop level), the OS can schedule other processes' work instead, which is precisely the mechanism underlying why a single machine can host many concurrent processes appearing to make progress simultaneously despite having a finite number of CPU cores.

## 5. Example

```
ps aux --sort=-%mem | head       # which processes are using the most memory right now
ls -l /etc/passwd                 # owner, group, and permission bits, made concrete
top                                # live view of CPU/memory contention across all processes
```

## 6. Code

```
# A real, common permission mistake and its fix:
chmod 777 config.json    # WRONG: readable/writable/executable by literally anyone
chmod 600 config.json    # RIGHT: owner-only read/write — appropriate for a file
                          # containing secrets (Level 11 previews this directly)
```

## 7. Failure scenarios

- **A stack overflow from unbounded recursion**, exhausting the stack region's fixed size — Level 0's diagnostic content directly, concretely explained by this lesson's memory-layout mechanism.
- **An over-permissioned config or secrets file** (`chmod 777`, or even a too-broad `644` on something containing credentials) — a real, common, entirely avoidable security gap.
- **A memory leak in a long-running process** — the heap growing unboundedly because references to no-longer-needed objects are retained, eventually exhausting available memory and triggering the OS's out-of-memory killer, a real, common production incident this lesson's memory model makes precisely diagnosable rather than mysterious.

## 8. Common misconceptions

- **"Threads and processes are basically interchangeable terms for 'concurrent execution.'"** They differ specifically in memory-space sharing — a distinction with real, direct consequences (Module 3, Lesson 9's process-per-connection Postgres architecture being a concrete instance of choosing process isolation deliberately, at a real memory cost).
- **"Virtual memory addresses are the actual physical RAM locations."** They're an indirection the CPU's page tables translate — this is precisely what lets many processes each believe they have their own private, contiguous address space despite sharing fragmented physical RAM.
- **"A namespace is a Docker-specific concept."** It's a Linux kernel feature any process can use directly — Docker (Lesson 2) is a convenient, standardized tool built on top of this pre-existing kernel mechanism, not something Docker itself invented.

## 9. Trade-offs

Process isolation (Postgres's per-connection model): real memory/resource overhead per connection, genuine fault isolation (one connection's crash doesn't directly corrupt another's memory). Thread-based concurrency: cheaper per-unit resource cost, shared-memory risk (a bug in one thread can corrupt data another thread is using, since they share the same address space).

## 10. Real-world applications

- Every "why is my server out of memory" or "why did my process crash" investigation ultimately traces back to this lesson's process/memory model — this is the diagnostic vocabulary underlying Level 10's observability content and Level 12's performance-profiling content.
- Container resource limits (Lesson 2) are directly built on this lesson's process-and-kernel-resource model, not a separate abstraction layered arbitrarily on top.

## 11. Connections

Directly grounds Level 0's event-loop and stack-overflow content in the actual OS mechanism underneath it, and Module 3, Lesson 9's process-per-connection Postgres architecture. Sets up Lesson 2 (containers, built directly on this lesson's namespace and cgroup mechanisms) and Level 11's least-privilege content (previewed here via file permissions).

## 12. Practical exercise

On a Linux machine (or WSL/a Linux container), run `ps aux`, `top`, and inspect a running Node process's memory usage over time as it handles increasing load, connecting what you observe back to this lesson's heap/stack/process model.

## 13. Challenge

Diagnose a described production incident (in conversation) where a service's memory usage grows steadily over days until it's killed and restarted — using this lesson's process-memory vocabulary to reason about what's likely happening and what you'd check to confirm.

## 14. Mastery test

- Explain the difference between a process and a thread precisely enough to state why Postgres chose a process-per-connection model and what that choice costs versus what it buys.
- Explain what a stack overflow actually is, in terms of this lesson's memory-layout content.
- Name three Linux namespace types and what each one isolates, and explain why this is the literal mechanism containers are built on.
