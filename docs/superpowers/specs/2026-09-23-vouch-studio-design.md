# Vouch Studio: design

**Date:** 2026-09-23 · **Hackathon:** Atumera Livepeer Agent Hackathon, Track 01 (Livepeer Agent Builder) · **Deadline:** 2026-09-24 23:59 Europe/Athens

## One line

You write one brief. Several Livepeer models render it side by side. A blind judge checks each render against the brief and grades it. The winner gets the Vouch Seal. Every graded render also feeds a public leaderboard of which model wins for which kind of work.

## Why this shape

- The hackathon asks for apps that let people **direct, review and refine** media. Here, direct is writing the brief and choosing the lineup. Review is the blind, itemized grading. Refine is the feedback-driven re-render with a visible score change.
- Livepeer Agent is central. Every render, every judge call and every prompt rewrite runs through `https://agent.livepeer.org/api/mcp` (`run_capability`, `describe_capability`, `get_create_media`, `upload`). The network publishes a measured SLA for every model (success rate, p50/p95, `effective_cost_usd`). Vouch adds the one thing the network can't measure: **whether the output is actually good for this brief**.
- The idea comes from Vouch, which rated OKX.AI agents. None of that code or data carries over. We reuse only the grade scale, the Seal and the visual language.

## Verified facts (probed live, 2026-09-23)

- Keyless demo mode works. The allowance is about $100 per day per network address. `Authorization: Bearer <key>` is optional.
- `run_capability { capability, prompt, inputs, timeout, session_id }` works. Fast models return inline with `structuredContent.url` and `cost_usd_estimated`. Slow models return `job_id` (`mjob_*`), and we poll `get_create_media`.
- `flux-schnell` render: 18 s wall time, $0.0032.
- `nemotron-omni-vision` with `inputs.image_url`: 9 s, $0.006. It returned valid JSON scores for a brief.
- `gemini-text` is text-only and cheap (about $0.0001 per call). We use it to decompose the checklist, classify the category and rewrite prompts.
- `marlin-video` (video understanding) is slow (p50 90 s) and unreliable (69 % success), so it is **not** used for grading.

## The loop

1. **Direct.** Brief text, kind (image or video) and aspect ratio. A preflight step classifies the category and proposes a lineup of 3 models:
   - the best model on the Board for this category,
   - the best-value model,
   - a *challenger*, the least-sampled contender, so the Board keeps learning.

   Each lineup card shows price, `effective_cost_usd` (price ÷ success rate) and p50 latency from `describe_capability`. The user can swap any model.
2. **Shootout.** The same brief goes, unmodified, to every model in parallel, which keeps the comparison fair. Each entry moves through `queued → rendering → judging → done | failed`. Clients poll.
3. **Review.** A blind judge scores each entry:
   - The checklist is created once per shootout. `gemini-text` decomposes the brief into 4–6 atomic requirements that can be verified visually.
   - Per entry, `nemotron-omni-vision` receives the image, or a contact sheet of 3 frames for video. It returns `{checks: [{id, verdict: yes|partial|no, note}], craft 0-10, aesthetics 0-10, defects[], verdict}`. It never sees the model name.
   - Scoring is deterministic (below). The highest score wins and gets the Seal if it grades A or better.
   - The user can overrule the judge. Their pick is stored next to the judge's pick, and the Board reports how often the judge and humans agree.
4. **Refine.** The user picks an entry and writes feedback. `gemini-text` rewrites the prompt from the original brief, the failed checks, the defects and the feedback. This creates a child shootout (round n+1) on the chosen model. Its checklist is the parent checklist plus requirements derived from the feedback. The arena shows score deltas against the parent entry.
5. **Board.** Aggregated from every judged entry, per `kind × category × model`: mean Vouch score and grade, mean fidelity, $ per usable render, p50 render time, win rate, sample size. It is seeded by a real benchmark run of fixed briefs, committed with its media mirrored locally.

## Scoring (pure, published on /methodology)

- `fidelity` = mean over requirements of (yes = 1, partial = 0.5, no = 0) × 100
- `craft` = judge craft × 10; `aesthetics` = judge aesthetics × 10
- `quality` = 0.60 · fidelity + 0.25 · craft + 0.15 · aesthetics
- `value` = clamp(100 − 40 · log10(cost / floor)), where floor = $0.003 for images and $0.05 for video
- `speed` = clamp(100 − 45 · log10(renderMs / floorMs)), where floorMs = 8 000 for images and 40 000 for video (wall-clock, MCP round trip included)
- `vouch` = 0.70 · quality + 0.20 · value + 0.10 · speed

Caps (an entry cannot be "cheap and wrong" and still grade well):
- fidelity < 50 → max 58 (C). Reason: "misses the brief".
- failed render → 0 (F).

Grades: S ≥ 92, A ≥ 80, B ≥ 66, C ≥ 52, D ≥ 38, F < 38. **Seal:** the shootout winner with grade A or better.

## Contenders (curated, not all 175 models)

- **Image:** `flux-schnell`, `krea-2-turbo`, `gemini-image`, `ideogram-v4`, `flux-dev`, `seedream-5-lite`, `flux-pro`, `qwen-image-3-t2i`, `uni-1-t2i`, `grok-imagine-quality`.
- **Video:** `ltx-25-t2v-fast`, `pixverse-t2v`, `kling-v3-turbo-t2v`, `ray-32-t2v`, `ltx-t2v`, `minimax-h3-t2v`.

Each contender declares its input mapping (aspect-ratio and duration parameter names come from `describe_capability`), its tier and its price unit.

Categories. Image: `product`, `portrait`, `landscape`, `typography`, `character`, `food`, `architecture`. Video: `product`, `nature`, `character`, `action`.

## Architecture

- Next.js 15 (App Router), React 19, Tailwind 4, TypeScript. Server-side only for Livepeer; the browser never talks to Livepeer. Deployed on Railway as a long-running Node server.
- `src/livepeer/`: MCP JSON-RPC client (`initialize`, `tools/call`, optional bearer, session id). Also typed helpers (`runCapability` with async job polling, `describe` cached for 5 minutes, `upload`) and response parsers (url, job id, cost).
- `src/engine/`:
  - `contenders.ts`: the registry
  - `checklist.ts`: decomposition and category classification, with a keyword fallback
  - `judge.ts`: vision prompt and a robust JSON parser, with one retry on a parse failure
  - `frames.ts`: video → 3-frame contact sheet (ffmpeg-static), then Livepeer `upload`
  - `score.ts`: pure scoring
  - `shootout.ts`: orchestration of state transitions
  - `refine.ts`: prompt rewriting
  - `lineup.ts`: the router
  - `board.ts`: aggregation
- `src/store/`: a `Store` interface with a `FileStore` implementation. It writes one JSON file per shootout under `DATA_DIR` and also reads the read-only `seed/` dir. The in-memory board cache is invalidated on write. The interface is kept deliberately small so a DKG-backed store can replace it (Track 02 stretch).
- Background work: `POST /api/shootouts` persists the record and starts `runShootout(id)` without awaiting it, and every transition is persisted. Guards: at most 2 concurrent shootouts, a per-IP limit (6 per hour), and a daily spend ceiling (`DAILY_SPEND_USD`, default 8).

## API

- `POST /api/preflight {brief, kind}` → `{category, lineup[]}`
- `POST /api/shootouts {brief, kind, aspect, models[]}` → `{id}`
- `GET /api/shootouts/:id`
- `POST /api/shootouts/:id/pick {entryId}`
- `POST /api/shootouts/:id/refine {entryId, feedback}` → `{id}` (the child)
- `GET /api/board?kind&category`
- `GET /api/recommend?kind&category&maxCostUsd` → best model plus evidence, for other agents

## Pages

`/` (Studio: composer, preflight, recent shootouts, Board teaser) · `/s/[id]` (Arena) · `/board` · `/models/[id]` · `/methodology` · `/api-docs`.

## Error handling

- A capability error puts the entry in `failed`, with the Livepeer error text, and the entry scores F.
- The shootout continues as long as at least one entry succeeds.
- A judge parse failure triggers one retry. After that the entry is `ungraded` and excluded from the Board.
- Async jobs are polled every 5 s up to the capability's p95 + 60 s. We never resubmit, because resubmitting bills twice.
- Timeouts are sized from `describe_capability` p95.

## Testing

Vitest unit tests cover the scoring, judge JSON parsing (fenced, prose-wrapped and malformed inputs), Livepeer response parsing (fixtures recorded from live calls), lineup selection and board aggregation. A live smoke script runs one real shootout.

## Out of scope

x402, wallets, OKX anything, accounts or auth, audio, image-to-video, and DKG unless we are ahead on Thursday midday.
