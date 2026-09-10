# Kubernetes Concepts — Pods, Deployments, Services, and the Control-Loop Mental Model

## 1. Why does this exist?

Every mechanism this module has built up — Lesson 2's containers, Module 7, Lesson 3's Raft consensus (etcd, Kubernetes' own cluster-state store, runs on Raft directly), Module 1, Lesson 8's load balancing — converges in Kubernetes, which is why this lesson is placed last in the module: understanding it as "just another tool to memorize commands for" produces shallow, brittle knowledge, while understanding it as the composition of mechanisms you already know produces genuine comprehension. This is deliberately a conceptual, mental-model-level treatment, not an operational tutorial — per the roadmap's own stated scope for this topic.

## 2. Mental model

Kubernetes is not a system you give one-time instructions to — it's a **continuous control loop** that you tell your *desired* end state, and it perpetually works to make reality match that description, correcting drift automatically whenever reality and your declaration diverge (a node dies, a pod crashes) without you needing to notice and manually intervene each time. This declarative, self-correcting model is the single most important thing to internalize before any of the specific object types make sense — every Kubernetes object is a *declaration of intent*, not an imperative command.

## 3. Technical explanation

**Pods — the smallest deployable unit, and precisely why it's not simply "a container":** a pod is one or more containers (Lesson 2) that are deployed, scaled, and deleted together as a single unit, sharing the same network namespace (they share one IP address and can reach each other via `localhost`) and, optionally, shared storage volumes. The overwhelmingly common case is one container per pod — the multi-container case exists specifically for tightly-coupled helper containers (a "sidecar" pattern — e.g., a logging agent that needs to share the main container's filesystem or network namespace directly) that genuinely need to be co-scheduled and co-located, not merely related. A pod is deliberately treated as **ephemeral** — Kubernetes expects pods to die and be replaced routinely (a node failure, a deployment update), and nothing about your application design should assume a specific pod instance is durable or long-lived, directly echoing this curriculum's repeated point (Module 7's whole distributed-systems content) that individual nodes/instances failing is a normal, expected event to design around, not an exceptional one.

**Deployments — the controller that maintains a desired number of healthy pod replicas, continuously, using exactly this lesson's control-loop mental model:** you declare "I want 3 replicas of this pod running this image," and the Deployment controller continuously reconciles reality toward that declaration — if a pod crashes, it's replaced automatically; if you update the image version, the Deployment controller orchestrates a rollout (directly implementing Lesson 3's rolling-deployment strategy, natively, as a first-class Kubernetes mechanism rather than something you script by hand). This is the concrete, operational realization of Lesson 3's abstract deployment-strategy content — a Kubernetes Deployment's rolling-update behavior *is* Lesson 3's rolling deployment, with configurable parameters (how many old pods to take down before bringing up new ones) directly controlling the pace and risk of the mixed-version window that Module 3, Lesson 8's Expand-Contract discipline exists to survive.

**Services — the stable network identity problem's solution, directly connecting to Module 1's DNS and load-balancer content:** because pods are ephemeral (dying and being replaced with new pods that get new IP addresses), nothing else in the cluster can reliably address a pod by its own IP. A **Service** provides a stable, persistent virtual IP and DNS name (Module 1, Lesson 4's resolution content, applied natively inside a Kubernetes cluster) that automatically routes to whichever set of currently-healthy pods match a label selector — a Service is, precisely, a load balancer (Module 1, Lesson 8) plus service-discovery (Module 1, Lesson 4's naming problem) combined into one Kubernetes-native object, continuously updated as the underlying pod set changes (new pods added by a scale-up, dead pods removed automatically), rather than a static, manually-maintained list of backend addresses.

**The reconciliation loop, made precise — the mechanism underlying every controller (Deployments, and others), worth stating exactly rather than leaving as a vague "it self-heals" claim:** every controller runs a continuous loop: observe the cluster's **actual** current state, compare it against the **desired** state declared in your configuration, and take action to reduce any difference — then repeat, indefinitely. This is a genuinely different operational paradigm from imperative scripting ("run this command to start 3 instances") — you never imperatively tell Kubernetes "restart this crashed pod"; you declare "3 replicas should exist," and the reconciliation loop's continuous observation naturally produces that restart as a side effect of continuously correcting toward your declared state, the moment it notices reality (2 replicas, one crashed) has diverged from your declaration (3 replicas).

**etcd — the cluster's own source of truth, and a direct, concrete tie-back to Module 7, Lesson 3's Raft content, worth stating explicitly rather than leaving implicit:** every Kubernetes object's desired state (every Deployment's replica count, every Service's configuration) is stored durably in **etcd**, a distributed key-value store using **Raft consensus** (Module 7, Lesson 3's exact algorithm) to keep its own data consistent and available across multiple nodes. This means Kubernetes' own foundational reliability is built directly on the consensus mechanism this curriculum already taught you in depth — a genuinely concrete, satisfying instance of a module's abstract content becoming directly operationally relevant, not a separate, unrelated piece of trivia to memorize.

## 4. How it works internally

When you update a Deployment's image version, the Deployment controller doesn't directly modify existing pods — it creates a new **ReplicaSet** (a lower-level controller maintaining a specific pod template's replica count) with the new image, and gradually scales the new ReplicaSet up while scaling the old one down, per Lesson 3's rolling-deployment mechanics — this two-level structure (Deployment managing ReplicaSets, ReplicaSets managing Pods) is precisely what enables clean rollback (scale the old ReplicaSet back up, scale the new one down) without needing to somehow "undo" changes to individual pods directly.

## 5. Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: my-api }
spec:
  replicas: 3                    # the DESIRED state — the control loop
                                  # continuously works to make this true
  selector: { matchLabels: { app: my-api } }
  template:
    metadata: { labels: { app: my-api } }
    spec:
      containers:
        - name: api
          image: my-api:v2       # updating this triggers a rolling update
```

## 6. Code

```yaml
apiVersion: v1
kind: Service
metadata: { name: my-api-service }
spec:
  selector: { app: my-api }      # routes to ANY currently-healthy pod
                                  # matching this label — the pod SET,
                                  # not any specific pod's own identity
  ports: [{ port: 80, targetPort: 3000 }]
```

## 7. Failure scenarios

- **An application assuming a specific pod's local state (in-memory cache, a file written to local disk) persists across restarts** — directly violates pods' deliberate ephemerality; a crashed-and-replaced pod starts fresh, with no memory of the dead pod's local state, exactly analogous to Module 5's caching content on what should and shouldn't be trusted as durable.
- **A Deployment's rolling update proceeding through a breaking schema change without Module 3, Lesson 8's Expand-Contract discipline** — the exact same mixed-version-window failure Lesson 3 described, now happening automatically and rapidly under Kubernetes' own rollout mechanics rather than a manually-paced deploy.
- **A Service's label selector misconfigured to not match any actual running pods** — a real, common, easy-to-miss configuration mistake producing a Service that exists but silently routes nowhere.

## 8. Common misconceptions

- **"Kubernetes gives you imperative commands to manage infrastructure."** Its entire model is declarative — you state desired state, and a continuous reconciliation loop, not a one-time command execution, is what actually makes reality match it, indefinitely.
- **"A pod and a container are the same thing, just different names."** A pod is Kubernetes' unit of co-scheduling and shared networking, potentially containing more than one container — genuinely a different, higher-level concept than a single container itself (Lesson 2).
- **"A Kubernetes Service is just a name for 'a group of pods.'"** It's an active, continuously-updated load-balancing and service-discovery mechanism (Module 1's content, natively implemented) — not merely a label or grouping construct.

## 9. Trade-offs

Kubernetes: genuine, powerful self-healing and declarative infrastructure management, at the cost of real operational complexity (etcd, controllers, the reconciliation-loop mental model itself) that's a poor fit for a small system that doesn't need this level of orchestration sophistication — directly echoing Module 8, Lesson 1's "don't adopt distributed-systems complexity before you actually need it" reasoning, applied here to orchestration infrastructure specifically.

## 10. Real-world applications

- Any system genuinely operating at Module 8, Lesson 1's microservices scale (multiple independently-deployed services, needing robust self-healing and service discovery) is a real, direct Kubernetes use case — this lesson's content is the conceptual floor for operating that infrastructure competently, not academic background.

## 11. Connections

Directly depends on Lesson 2 (containers are the unit Kubernetes orchestrates), Lesson 3 (Deployments natively implement that lesson's rolling-deployment strategy), Module 1, Lessons 4 and 8 (Services combine DNS and load-balancing), and Module 7, Lesson 3 (etcd's Raft-based consistency). This lesson is deliberately the module's synthesis point, tying nearly every prior module's content into one operationally real system.

## 12. Practical exercise

Using a local Kubernetes environment (minikube or an equivalent), deploy the example Deployment and Service above, then deliberately delete one of the running pods and observe the Deployment controller automatically replace it — directly witnessing the reconciliation loop in action rather than taking it on description alone.

## 13. Challenge

For Project 5 (Distributed System), sketch the Kubernetes resources (Deployments, Services) needed for its multiple services, and identify explicitly where Module 3, Lesson 8's Expand-Contract discipline becomes necessary given Kubernetes' own rolling-update rollout behavior.

## 14. Mastery test

- Explain the reconciliation-loop model precisely enough to state why Kubernetes never needs an explicit "restart this crashed pod" command from you.
- Explain why pods are deliberately ephemeral, and what this means for how you should (and shouldn't) design application state.
- Explain what a Service actually does, connecting it explicitly to Module 1's DNS and load-balancing content rather than describing it as a standalone concept.
- Explain the direct, concrete connection between etcd's reliability and Module 7, Lesson 3's Raft content.
