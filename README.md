# Vouch Studio

> Find the right AI model for every shot. Describe it once, watch three models compete on the Livepeer network, and get a blind, evidence-backed verdict.

**Live app:** https://web-production-e90e7.up.railway.app
**Hackathon:** Atumera Livepeer Agent Hackathon, Track 01 (Livepeer Agent Builder)

---

## Contents

- [The problem](#the-problem)
- [What Vouch Studio does](#what-vouch-studio-does)
- [Features](#features)
- [How it works](#how-it-works)
- [How renders are scored](#how-renders-are-scored)
- [How it uses Livepeer](#how-it-uses-livepeer)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Use it from an agent (MCP)](#use-it-from-an-agent-mcp)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Testing](#testing)
- [Limitations](#limitations)

---

## The problem

The Livepeer network offers dozens of image and video models behind one API. Choosing between them is guesswork:

- Prices for the same shot vary by up to 20x.
- Vendor samples are cherry-picked.
- A model that is great at portraits can fail at spelling a sign or counting objects.

There is no easy way to know which model will actually deliver *your* shot, at what cost.

## What Vouch Studio does

Vouch Studio replaces the guess with a measured answer. You describe the shot, and it:

1. Picks three suitable models, using everything it has learned so far.
2. Renders your brief on all three at the same time on Livepeer.
3. Grades every render blind against a checklist built from your brief.
4. Names the winner and shows the evidence: what each render got right, what it missed, what it cost and how long it took.

Every result also feeds **the Board**, a public ranking of models built only from real, graded renders. Other agents can query it through a JSON API before they spend anything.

## Features

| Feature | Description |
| --- | --- |
| **Shootouts** | One brief, up to three models, rendered in parallel. Image and video. |
| **Blind judging** | A vision model grades each render against a checklist without knowing which model made it. |
| **Evidence, not just scores** | Every requirement is marked met, partly met or missed, with a note. Flaws are listed. |
| **Smart lineups** | Each shootout proposes the best model for your kind of shot, the best value, and a challenger. You can swap any of them. |
| **Refine rounds** | Give feedback on a render. Your feedback becomes new checklist items, the prompt is rewritten, and the next round shows the score change. |
| **Human override** | Pick a different winner than the judge. The Board reports how often people agree with the judge. |
| **The Board** | Models ranked by score, quality, cost per usable render, speed, win rate and reliability, overall and per kind of shot. |
| **MCP server** | Claude, Cursor or any MCP client can ask which model to use, run shootouts, refine renders and read the Board. |
| **Agent API** | Ask which model to use under a budget, or run a shootout and read the verdict as JSON. |

## How it works

```
 Brief ──► Plan lineup ──► Build checklist ──► Render ×3 (parallel) ──► Judge each (blind) ──► Score ──► Verdict
              │                                                                                    │
              └──────────────────────────── learns from ◄── The Board ◄────────────────────────────┘
```

1. **Plan.** The brief is classified (product, portrait, typography, food and so on). The router proposes three models from the Board and shows each one's live Livepeer price, network latency and success rate.
2. **Checklist.** A text model turns the brief into 4–8 requirements you can confirm by looking: subject, counts, colours, placement and exact quoted text.
3. **Render.** All contenders run in parallel on Livepeer, each called by its exact model name. Long video jobs are polled until they finish.
4. **Judge.** A vision model grades each render in two independent passes, which are merged. Video is judged from three frames taken at 15%, 50% and 85% of the clip.
5. **Score and decide.** Each render gets a grade from S to F. The highest score wins, and a winner scoring 80 or more receives the Vouch seal.

## How renders are scored

```
Quality     = 60% matches the brief + 25% craft + 15% aesthetics
Vouch score = 70% quality + 20% value + 10% speed
```

- **Matches the brief** is the share of checklist requirements met; partly met counts as half.
- **Value** and **speed** use a log scale, so twice as fast or ten times cheaper is a visible step.
- **Misses the brief:** a render below 50 on brief match is capped at 58 (a C), however cheap or fast it was.
- **Failed renders** count as 0 in a model's Board score, because that is what you got when you called it.
- **Grades:** S 92+, A 80+, B 66+, C 52+, D 38+, F below.

The full method is on the `/methodology` page of the app.

## How it uses Livepeer

Every render and every judgement runs on the Livepeer Agent MCP (`https://agent.livepeer.org/api/mcp`).

| Livepeer tool | What Vouch Studio uses it for |
| --- | --- |
| `run_capability` | Renders on 10 image and 6 video models, checklist building and prompt rewriting (`gemini-text`), and judging (`nemotron-omni-vision`) |
| `get_create_media` | Polling long-running video jobs |
| `describe_capability` | Live price, p50 latency and success rate shown on lineup cards |
| `upload` | Hosting video frame sheets so the vision judge can read them |
| `session_id` | One session per shootout, so its total spend is traceable |

**Models in the field**

- **Image:** FLUX.1 schnell, FLUX.1 dev, FLUX1.1 pro ultra, Gemini 2.5 Flash Image, Ideogram v4, Krea 2, Krea 2 Turbo, Seedream 5 Lite, Luma Uni-1, Grok Imagine
- **Video:** LTX 2.5 Fast, LTX 2.3, PixVerse C1, Kling 3 Turbo, Luma Ray 3.2, MiniMax H3

## Tech stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **Video frames:** ffmpeg (via `ffmpeg-static`)
- **Storage:** JSON file store behind a small `Store` interface
- **Tests:** Vitest
- **Hosting:** Railway, with a persistent volume

## Getting started

### Prerequisites

- Node.js 20 or later
- pnpm 10

### Install and run

```bash
git clone https://github.com/martinvibes/vouch-studio.git
cd vouch-studio
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

No API key is needed to try it. Without one, the server uses Livepeer's free demo credit.

## Configuration

Set these in `.env.local`, or in your host's environment.

| Variable | Default | Description |
| --- | --- | --- |
| `LIVEPEER_API_KEY` | *(none)* | Livepeer key from [app.daydream.live](https://app.daydream.live). Optional. Kept server-side only. |
| `LIVEPEER_MCP_URL` | `https://agent.livepeer.org/api/mcp` | Livepeer Agent MCP endpoint |
| `DATA_DIR` | `./data` | Where new shootouts are saved. Point this at a persistent volume in production. |
| `DAILY_SPEND_USD` | `8` | Daily spending limit across all visitors |
| `SHOOTOUTS_PER_IP_PER_HOUR` | `6` | Shootouts allowed per visitor per hour |
| `MAX_CONCURRENT_SHOOTOUTS` | `2` | Shootouts that run at once; extra ones wait in a queue |

## Use it from an agent (MCP)

Vouch Studio is an MCP server (Streamable HTTP, stateless, no key needed):

```
https://web-production-e90e7.up.railway.app/api/mcp
```

**Claude Code**

```bash
claude mcp add --transport http vouch-studio https://web-production-e90e7.up.railway.app/api/mcp
```

**Cursor** (`.cursor/mcp.json`)

```json
{ "mcpServers": { "vouch-studio": { "url": "https://web-production-e90e7.up.railway.app/api/mcp" } } }
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{ "mcpServers": { "vouch-studio": { "command": "npx", "args": ["-y", "mcp-remote", "https://web-production-e90e7.up.railway.app/api/mcp"] } } }
```

| Tool | What it does | Cost |
| --- | --- | --- |
| `recommend_model` | Best model for a kind of shot under a budget, from graded renders | Free |
| `plan_shootout` | Classify a brief and propose three models with live prices | Free |
| `run_shootout` | Render a brief on up to three models, judge blind, return the verdict | Spends credit |
| `get_shootout` | Read a shootout's status and verdict | Free |
| `refine_render` | Start a new round on one render with feedback | Spends credit |
| `get_board` | The model ranking, by media type and kind of shot | Free |
| `list_models` | Every model in the field with its price | Free |

`run_shootout` waits for the verdict (about 30 seconds for images) and returns the winner, each render's grade, the checks it missed, its flaws, cost and a link to the result page. Video returns straight away with an `id` to poll with `get_shootout`.

## API reference

No key is required. Shootouts count against the per-visitor rate limit and the daily spending limit.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/recommend?kind=&category=&maxCostUsd=` | Best model for a kind of shot under a budget, with alternatives |
| `POST` | `/api/preflight` | Classify a brief and propose a lineup with live prices. Free. |
| `POST` | `/api/shootouts` | Start a shootout. Returns an `id` immediately. |
| `GET` | `/api/shootouts` | Recent shootouts |
| `GET` | `/api/shootouts/:id` | Full result: checklist, renders, verdicts, scores and refine rounds |
| `POST` | `/api/shootouts/:id/refine` | Start a new round on one render with your feedback |
| `POST` | `/api/shootouts/:id/pick` | Record which render a person preferred |
| `GET` | `/api/board?kind=&category=` | The Board as JSON |

**Example: ask for a recommendation**

```bash
curl "https://web-production-e90e7.up.railway.app/api/recommend?kind=image&category=typography&maxCostUsd=0.02"
```

**Example: run a shootout and read the result**

```bash
curl -X POST https://web-production-e90e7.up.railway.app/api/shootouts \
  -H 'content-type: application/json' \
  -d '{"brief":"A neon sign reading \"OPEN LATE\" above a ramen shop door","kind":"image","models":["flux-dev","ideogram-v4","gemini-image"]}'

# Returns {"id":"<id>"}. Poll until status is "done":
curl https://web-production-e90e7.up.railway.app/api/shootouts/<id>
```

## Project structure

```
src/
├── app/            Pages (Studio, Arena, Board, model pages, docs, methodology, API docs), API routes and the MCP endpoint
├── components/     UI components (composer, arena, grade stamp, seal, theme toggle)
├── engine/         Core logic: contenders, checklist, judge, video frames, scoring,
│                   Board, lineup router, shootout runner, refine, rate and spend limits
├── livepeer/       Livepeer Agent MCP client (retries, job polling, pricing, uploads)
├── store/          Storage interface and file store
└── lib/            Shared helpers
seed/shootouts/     Seed benchmark: 14 real shootouts (42 renders) run on Livepeer
public/seed-media/  Mirrored media for the seed benchmark
scripts/            benchmark.ts (re-run the seed) and smoke-livepeer.mts (connection check)
tests/              Unit tests and recorded Livepeer responses
```

## Deployment

The live app runs on Railway.

1. Create a service from this repo.
2. Attach a volume at `/data` and set `DATA_DIR=/data`.
3. Optionally set `LIVEPEER_API_KEY`.
4. Deploy. The start command is `pnpm start`, which binds to Railway's `PORT`.

The seed benchmark ships with the repo, so the Board is populated on first boot.

## Testing

```bash
pnpm test        # 57 unit tests, including the full shootout flow against fake Livepeer responses
pnpm typecheck   # TypeScript checks
pnpm benchmark   # Re-run the seed benchmark on Livepeer (real renders, about $7)
```

## Limitations

- **The judge is an AI.** It is strict and consistent, but it is not a human art director. On easy briefs, strong models tie and price decides. The seed briefs are hard on purpose (exact text, counts, placement), because that is where models really differ.
- **Small samples are noisy.** The Board shows how many renders each number is based on.
- **The store is built for a single server.** The `Store` interface is where a shared database would plug in.
