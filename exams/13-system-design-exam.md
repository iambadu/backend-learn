# Module Exam — 13: Advanced System Design (Capstone)

This module has no lesson-by-lesson exam in the usual sense — it's evaluated continuously, through System Design Mode sessions against `13-system-design/02-scenario-bank.md`, and finally through the Final Project. This file is the capstone rubric, not a question list.

---

## How this module is actually assessed

1. **Scenario-bank coverage.** Work through at least 6 of the 12 scenarios in `02-scenario-bank.md`, each via `System design` mode, applying `01-system-design-framework.md`'s four-step method. For each, log in `PROGRESS.md`'s per-topic mastery section: which attack questions you handled well unprompted, which you only answered when pushed, and which exposed a genuine gap sending you back to a specific earlier module's lesson.

2. **The Final Project.** Per `ROADMAP.md`: design a realistic African-market SaaS or fintech platform, end to end, on a blank page. You make every architectural decision — the tutor's role here shifts entirely to reviewer and attacker, not co-designer. This is the actual, final demonstration of mastery level 6 (Design) and, if you can teach the design's reasoning back clearly, level 7 (Teaching) across this entire curriculum.

3. **The standard attack-question set**, from `README.md` and restated in `01-system-design-framework.md`, applied without warning, in any order, to whatever you've proposed:
   - What happens when traffic increases 100×?
   - What happens if the database goes down?
   - What happens if a request is duplicated?
   - What happens if a message is delivered twice?
   - What happens if a worker crashes?
   - What happens if an external API times out?
   - What happens if the network partitions?
   - What happens if data becomes inconsistent?
   - Where is the bottleneck?
   - What is the consistency requirement — per data type, not for the system as a whole?
   - What should be cached, asynchronous, or transactional — and what does each choice actually cost?
   - What should be observable, and what specifically would page someone?

## Passing bar

Per `01-system-design-framework.md`'s "what good looks like" section: not a flawless design — a design where every weakness is named, specific, and deliberate, defended with the correct vocabulary and mechanism from the relevant earlier module, not hand-waved. If a specific attack question repeatedly produces a hand-wave rather than a grounded answer, that's a direct pointer back to a specific module's exam (per `PROGRESS.md`) worth revisiting before continuing.

## On completing this

There is no Module 14. Completing this capstone — the Final Project surviving the full attack-question set with every weakness named and deliberate — is the curriculum's terminal state: independent capability to design, build, debug, explain, and architect real backend systems without depending on this tutor. Update `PROGRESS.md` and `README.md`'s status to reflect the curriculum as complete, and treat `PROGRESS.md`'s spaced-review queue as the ongoing maintenance mode from here — revisiting misconceptions logged along the way, on increasing intervals, per `ROADMAP.md`'s spaced-review policy.
