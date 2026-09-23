# Vouch Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Vouch Studio, a Livepeer-powered multi-model shootout. It renders one brief on 3 models, grades each render blind against a checklist decomposed from the brief, lets the user refine, and aggregates everything into a public Board. The deadline is 2026-09-24 23:59 Athens.

**Architecture:** A Next.js 15 App Router app running as a long-running Node server (Railway). Only server code talks to Livepeer's MCP endpoint. The engine is pure TypeScript modules under `src/engine`. Scoring, parsing, lineup and board are pure functions and unit-tested. Orchestration persists every state transition through a small `Store` interface, backed by JSON files. Clients poll.

**Tech Stack:** Next.js 15, React 19, Tailwind 4, TypeScript 5, Vitest, ffmpeg-static, zod.

**Spec:** `docs/superpowers/specs/2026-09-23-vouch-studio-design.md`

## Global Constraints

- Node ≥ 20. Package manager: pnpm.
- The Livepeer endpoint is `https://agent.livepeer.org/api/mcp`. The bearer comes from `LIVEPEER_API_KEY` and is optional (keyless demo). It is never exposed to the client.
- Every billed `run_capability` passes `session_id: "vouch_<shootoutId>"`.
- Never re-submit a render after a client timeout. Poll `get_create_media` instead.
- The scoring constants are exactly as in the spec: quality 0.60/0.25/0.15, vouch 0.70/0.20/0.10. Floors: image $0.003 and 8 000 ms, video $0.05 and 40 000 ms (wall-clock). Fidelity cap: below 50 means max 58. Grades: S92, A80, B66, C52, D38.
- The judge prompt never contains the model name.
- No secrets in git. Seed data and mirrored media are committed; runtime data goes to `DATA_DIR` (git-ignored).

## File map

```
src/livepeer/client.ts        MCP JSON-RPC client: rpc(), callTool(), runCapability(), describe(), upload()
src/livepeer/parse.ts         pure: extractUrl, extractJobId, extractStatus, extractCost, extractText, isToolError
src/engine/types.ts           domain types (Shootout, Entry, Requirement, JudgeResult, ScoreBreakdown, ...)
src/engine/contenders.ts      curated registry + inputsFor(contender, kind)
src/engine/score.ts           pure scoring + grade + caps
src/engine/judgeParse.ts      pure: parseJudgeJson(text, requirementIds) → JudgeResult | null
src/engine/checklist.ts       decompose(brief, kind) via gemini-text (+ keyword category fallback)
src/engine/judge.ts           judgeEntry(imageUrl, brief, checklist, kind) via nemotron-omni-vision
src/engine/frames.ts          contactSheet(videoUrl) → hosted image url (ffmpeg-static + Livepeer upload)
src/engine/lineup.ts          pure: proposeLineup(board, kind, category, slas) → Contender[3]
src/engine/board.ts           pure: aggregate(shootouts) → BoardRow[]
src/engine/refine.ts          rewritePrompt(...) via gemini-text
src/engine/shootout.ts        createShootout / runShootout / pick / refine orchestration + guards
src/store/index.ts            Store interface + FileStore (DATA_DIR + seed dir)
src/app/api/**                route handlers (preflight, shootouts, pick, refine, board, recommend)
src/app/(pages)               /, /s/[id], /board, /models/[id], /methodology, /api-docs
src/components/**             Seal, GradeBadge, ThemeToggle, Nav, Footer, Composer, Arena, EntryCard, BoardTable...
scripts/benchmark.ts          real seed run → seed/shootouts/*.json + public/seed-media/*
tests/*.test.ts               vitest
```

---

### Task 1: Scaffold

**Files:** `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (placeholder)

- [ ] Copy the Vouch config files (tsconfig, postcss, next.config). Create package.json with next 15, react 19, tailwind 4, zod, ffmpeg-static, vitest and tsx.
- [ ] `pnpm install`. `pnpm build` must pass on the placeholder page.
- [ ] Commit `chore: scaffold Next.js app`.

### Task 2: Livepeer response parsing (TDD)

**Files:** Create `src/livepeer/parse.ts`, `tests/parse.test.ts`, `tests/fixtures/*.json` (recorded live responses)

**Produces:** `extractUrl(p): string|undefined`, `extractJobId(p)`, `extractStatus(p): string`, `extractCost(p): number|undefined`, `extractText(p): string`, `isToolError(p): boolean`

- [ ] Record fixtures from the live probes: an inline image result, a vision text result, an async job submit, a job poll done, and a tool error.
- [ ] Tests: the URL comes from `structuredContent.url`, with a fallback to the regex over text. The job id matches `mjob_*`. Cost comes from `cost_paid_usd ?? cost_usd_estimated`. The text for a vision result comes from `structuredContent.result.text`. `isError` is detected.
- [ ] Implement and make the tests pass. Commit.

### Task 3: Livepeer client

**Files:** Create `src/livepeer/client.ts`

**Produces:**
```ts
runCapability(args: { capability: string; prompt?: string; inputs?: Record<string, unknown>; sourceUrl?: string; timeoutS: number; sessionId: string; async?: boolean }): Promise<{ url?: string; text?: string; costUsd?: number; raw: unknown }>
describe(name: string): Promise<CapabilitySla>   // cached 5 min; {priceUsd, unit, p50Ms, p95Ms, successRate?, samples?, effectiveCostUsd?, health}
uploadBase64(data: Buffer, mime: string): Promise<string>  // hosted https url
```
- [ ] Implement JSON-RPC over fetch, with an optional bearer, initialize-once, and async polling (every 5 s until timeoutS + 60 s).
- [ ] Smoke test: `tsx scripts/smoke-livepeer.ts` renders flux-schnell and prints the url and cost. Commit.

### Task 4: Domain types, contenders, scoring (TDD)

**Files:** `src/engine/types.ts`, `src/engine/contenders.ts`, `src/engine/score.ts`, `tests/score.test.ts`

**Produces:** `scoreEntry({kind, judge, requirements, costUsd, renderMs, failed}): ScoreBreakdown`, `toGrade(n)`, `CONTENDERS`, `contender(id)`, `inputsFor(c)`

- [ ] Tests:
  - all yes, craft 9, aesthetics 9, $0.003, 2 s → quality 96 → vouch = 0.7·96 + 0.2·100 + 0.1·100 = 97.2 → S
  - fidelity 40 is capped at 58 (C), with the cap reason recorded
  - a failed render gives 0 (F)
  - value at 10× floor = 60
  - the grade thresholds hold at their edges
- [ ] Implement and make the tests pass. Commit.

### Task 5: Judge parsing (TDD) + checklist + judge + frames

**Files:** `src/engine/judgeParse.ts`, `tests/judgeParse.test.ts`, `src/engine/checklist.ts`, `src/engine/judge.ts`, `src/engine/frames.ts`

- [ ] Parser tests:
  - plain JSON
  - fenced ```json
  - JSON wrapped in prose
  - checks keyed by number or by id
  - verdicts normalized from `true`, `"Yes"` and `"partially"`
  - out-of-range scores clamped
  - missing checks count as "no"
  - total garbage returns null
- [ ] Checklist: gemini-text returns `{category, requirements[4..6]}`. On failure, fall back to keyword category detection plus a sentence-split checklist.
- [ ] Judge: numbered requirements plus craft/aesthetics rubric anchors, with one retry on a null parse. Live-check discrimination on a hard brief (in-image text).
- [ ] Frames: ffmpeg-static takes frames at 15/50/85 % and tiles them 3×1 into a jpg, which is then uploaded to Livepeer. Live-check on one video.
- [ ] Commit.

### Task 6: Store + board + lineup (TDD)

**Files:** `src/store/index.ts`, `src/engine/board.ts`, `src/engine/lineup.ts`, `tests/board.test.ts`, `tests/lineup.test.ts`

- [ ] Board tests: rows aggregate per (kind, category, model) and "all"; failed renders count against the success rate; ungraded entries are excluded; win rate = wins ÷ shootouts entered; `$ per usable` = total cost ÷ usable renders.
- [ ] Lineup tests: it returns 3 distinct contenders — the top by mean vouch in the category (min n = 1), the best value, and a challenger (fewest samples). It fills from default tiers when the board is empty and never returns a duplicate.
- [ ] FileStore: `get`, `save` (atomic write via tmp + rename), `list` (runtime ∪ seed, runtime wins).
- [ ] Commit.

### Task 7: Orchestration + API routes

**Files:** `src/engine/shootout.ts`, `src/engine/refine.ts`, `src/app/api/preflight/route.ts`, `src/app/api/shootouts/route.ts`, `src/app/api/shootouts/[id]/route.ts`, `.../pick/route.ts`, `.../refine/route.ts`, `src/app/api/board/route.ts`, `src/app/api/recommend/route.ts`

- [ ] `runShootout`:
  - builds the checklist once
  - renders entries in parallel
  - judges each entry as soon as its render lands
  - scores, picks the winner and persists after each transition
- [ ] Guards: concurrency ≤ 2 (queue otherwise), per-IP 6/h, daily spend ceiling. Each returns 429 with a reason.
- [ ] Refine: rewrite the prompt, then create a child shootout (parentId, round + 1) with one entry on the chosen model and the checklist plus feedback requirements.
- [ ] Live test: run one image shootout through the API with curl and verify the persisted JSON. Commit.

### Task 8: UI (frontend-design)

**Files:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/*`, pages

- [ ] Design direction: keep Vouch's "trust stamp" DNA (Seal, grade chips, gold), but make it a screening room: a darker default canvas where the media is the hero.
- [ ] Studio `/`: composer (brief, kind toggle, example briefs), preflight lineup cards with cost and SLA, swap model, start. Then recent shootouts and a Board teaser.
- [ ] Arena `/s/[id]`:
  - 3 entry cards with a live status timer
  - a media reveal, then a grade stamp animation
  - a checklist with ticks and notes, defects, score bars, and cost and latency chips
  - Seal on the winner, and an "I prefer this" override
  - a refine panel, and a round chain with deltas
- [ ] `/board`: kind tabs, category filter, and a ranked table.
- [ ] `/models/[id]`: scorecard, a gallery of renders with grades, per-category results, and the network SLA.
- [ ] `/methodology`, `/api-docs`.
- [ ] Commit per page.

### Task 9: Seed benchmark

**Files:** `scripts/benchmark.ts`, `seed/shootouts/*.json`, `public/seed-media/*`

- [ ] Image: 8 briefs across categories × 4 image contenders (rotating lineups so every contender gets n ≥ 3). Video: 3 briefs × 3 contenders.
- [ ] Mirror the media locally and rewrite the URLs to `/seed-media/...`.
- [ ] Commit.

### Task 10: Ship

- [ ] README (the pitch, how it uses Livepeer, the method, how to run), `.env.example`.
- [ ] Deploy to Railway (with a volume for `DATA_DIR`) and set `LIVEPEER_API_KEY` if one is provided.
- [ ] Full `pnpm test` and `pnpm build`, a live shootout on the deployed URL, and a final code review.
- [ ] Hand the user a demo-video script.
