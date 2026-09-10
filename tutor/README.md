# Backend University — Terminal Tutor

A standalone, zero-dependency Node.js CLI that runs the `backend-learn/` curriculum interactively in your terminal, using an OpenRouter model instead of this chat session.

## Setup

```
cd tutor
cp .env.example .env
```

Open `.env` and paste in your OpenRouter API key from https://openrouter.ai/keys. Optionally set `OPENROUTER_MODEL` to a specific open-weight model slug (see the comments in `.env.example` — model slugs change over time, check https://openrouter.ai/models if the default ever fails).

No `npm install` needed — this uses Node's native `fetch` and zero external dependencies. Requires Node 18+ (you have Node 24, so you're set).

## Run

From the `tutor/` directory:

```
node tutor.js
```

Or from anywhere in the repo:

```
node tutor/tutor.js
```

## What it does

- **Start** — walks the curriculum in sequence (tracked in `.tutor-state.json`, not `PROGRESS.md`), teaching each lesson Socratically rather than dumping the raw file at you.
- **Quiz me / Practice / Review** — pick any lesson directly and run one of those modes against it. Review pulls in any misconceptions logged for that lesson.
- **Exam** — pick a module and work through its cumulative exam file.
- **System design** — loads the Module 13 framework and scenario bank and runs attack-question-style design mode.
- **Progress** — shows your current lesson position and every mastery rating logged so far.

Inside any chat, `/next` advances (and, where applicable, asks the model to rate your demonstrated mastery 1-7 and logs it), `/menu` returns to the main menu, `/exit` saves and quits, `/help` lists commands.

## State

Progress lives in `.tutor-state.json` at the project root (gitignored by default in the main project's own `.gitignore` if you add it — this tool doesn't touch `PROGRESS.md` automatically, so that file stays the canonical, human-edited record; treat `.tutor-state.json` as this CLI's own scratch tracking, not a replacement for it).

## Notes

- This is a genuinely different tutor "voice" than this chat session — it's running on whatever model you configure via `OPENROUTER_MODEL`, with a condensed system prompt encoding the curriculum's philosophy, not the full context this conversation has built up. Expect it to be a reasonable, but not identical, tutor.
- Streaming output means you'll see the response appear token-by-token, same as a normal AI chat interface.
