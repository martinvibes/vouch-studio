# Vouch Studio

**Live:** https://web-production-e90e7.up.railway.app

**Which AI model should render this shot?** Describe it once. Vouch Studio runs your brief on three models on the Livepeer network, grades every render blind against a checklist written from your brief, and hands you the winner with the evidence: what each render got right, what it missed, what it cost and how long it took. Then refine the one you like, round by round.

Every shootout also feeds **the Board**: a public ranking of image and video models built only from renders we paid for and verdicts you can read. Other agents can query it through a JSON API before they spend anything.

Built for the Atumera Livepeer Agent Hackathon, Track 01 (Livepeer Agent Builder).

## Why

The Livepeer network exposes dozens of image and video models behind one API. Choosing between them is guesswork: vendor claims, cherry-picked samples, and prices that differ 20x for results that may or may not differ at all. Vouch Studio replaces the guess with a measured, per-brief answer.

## How a shootout works

1. **Plan.** The brief is classified (product, portrait, typography…) and the router proposes a lineup from the Board: the top model for that kind of shot, the best value above 70 quality, and a challenger that has been tested least. Each card shows the live Livepeer price and network SLA. You can swap any contender.
2. **Checklist.** `gemini-text` turns the brief into 4–8 requirements a viewer could verify by looking: counts, colours, placement, exact quoted text.
3. **Render.** All contenders run in parallel through Livepeer's `run_capability`, each by its exact capability name. Slow video jobs are polled with `get_create_media`. Nothing is ever re-submitted, because a re-run bills twice.
4. **Judge.** `nemotron-omni-vision` grades each render blind: yes, partly or no per requirement with evidence, plus craft and aesthetics scores and a list of flaws. Two independent passes are merged. Video is judged from a 3-frame contact sheet (15/50/85%) cut with ffmpeg and uploaded to Livepeer.
5. **Score.** Quality = 60% brief match + 25% craft + 15% aesthetics. Vouch score = 70% quality + 20% value + 10% speed, with value and speed on log scales. A render below 50 on brief match is capped at a C, however cheap or fast it was.
6. **Decide and refine.** The judge picks a winner (the Vouch seal goes to one scoring 80 or more). You can overrule it; the Board reports how often people agree with the judge. "Refine this render" turns your feedback into new requirements and a rewritten prompt, then runs the next round on the same model and shows the score change.

Full method: `/methodology` in the app.

## Livepeer usage

| Livepeer tool | Used for |
| --- | --- |
| `run_capability` | Every render (10 image models, 6 video models), the checklist and prompt rewrites (`gemini-text`), and the judge (`nemotron-omni-vision`) |
| `get_create_media` | Polling long video jobs |
| `describe_capability` | Live price, p50/p95 latency and success rate on the lineup cards |
| `upload` | Hosting video contact sheets so the vision judge can read them |
| `session_id` | Every shootout is one session, so its whole spend is traceable |

## API

No key required. Shootouts are rate-limited per caller and share a daily spend ceiling.

```bash
# Which model should I use for typography under 2 cents?
curl "https://<host>/api/recommend?kind=image&category=typography&maxCostUsd=0.02"

# Run a shootout, then poll it
curl -X POST https://<host>/api/shootouts -H 'content-type: application/json' \
  -d '{"brief":"A neon sign reading \"OPEN LATE\" above a ramen shop door","kind":"image","models":["flux-dev","ideogram-v4","gemini-image"]}'
curl https://<host>/api/shootouts/<id>
```

Also: `POST /api/preflight`, `POST /api/shootouts/:id/refine`, `POST /api/shootouts/:id/pick`, `GET /api/board`. See `/api-docs` in the app.

## Run it

```bash
pnpm install
cp .env.example .env.local   # LIVEPEER_API_KEY is optional; keyless uses Livepeer's demo credits
pnpm dev                     # http://localhost:3000
pnpm test                    # 50 unit tests, including the full orchestration against fakes
pnpm benchmark               # re-run the seed benchmark (real renders, about $6)
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `LIVEPEER_API_KEY` | none | Bearer key from app.daydream.live. Server-side only. |
| `LIVEPEER_MCP_URL` | `https://agent.livepeer.org/api/mcp` | Livepeer Agent MCP endpoint |
| `DATA_DIR` | `./data` | Where runtime shootouts are stored. Mount a volume here in production. |
| `DAILY_SPEND_USD` | `8` | Server-wide daily ceiling across all visitors |
| `SHOOTOUTS_PER_IP_PER_HOUR` | `6` | Per-visitor rate limit |
| `MAX_CONCURRENT_SHOOTOUTS` | `2` | More than this queue |

## Layout

```
src/livepeer/     JSON-RPC client for the Livepeer Agent MCP (retries, polling, SLA cache, upload)
src/engine/       contenders, checklist, judge, frames (video), score, board, lineup router,
                  shootout orchestration, refine, demo guards
src/store/        file-backed store behind a small interface (seed + runtime)
src/app/          Next.js pages (Studio, Arena, Board, model pages, method, API docs) and API routes
seed/shootouts/   the committed seed benchmark; public/seed-media holds its mirrored renders
scripts/          benchmark.ts (seed run) and smoke-livepeer.mts (connectivity check)
```

## Limits

- The judge is a vision model: strict and consistent, not a human art director. On easy briefs strong models tie and value decides. The seed briefs are deliberately hard (exact text, counts, placement) because that is where models differ.
- Small samples are noisy; the Board shows the sample size behind every number.
- The file store suits a single instance. The `Store` interface is the seam for a shared backend.
