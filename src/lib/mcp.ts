import { contender, contendersFor, estimateCostUsd } from "@/engine/contenders";
import { checkRate } from "@/engine/guards";
import { createRefine, createShootout, startShootout, validateBrief, validateModels } from "@/engine/shootout";
import { SEAL_THRESHOLD } from "@/engine/score";
import type { Shootout } from "@/engine/types";
import { store } from "@/store";
import { boardSnapshot } from "./boardView";
import { planLineup } from "./preflight";
import { recommend } from "./recommend";

/**
 * Vouch Studio as an MCP server, so any agent (Claude, Cursor, a Livepeer
 * agent) can ask which model to use, run a shootout, and read the verdict.
 * Stateless Streamable HTTP: every request is one JSON-RPC message, answered
 * with plain JSON.
 */

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type McpContext = { baseUrl: string; ip: string };

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  run(args: Record<string, unknown>, ctx: McpContext): Promise<unknown>;
};

const KIND = { type: "string", enum: ["image", "video"], description: "Image or video. Defaults to image." };
const WAIT = {
  type: "number",
  description: "Seconds to wait for the verdict before returning (0-240). Images take ~30s, video 1-5 min. If it isn't done yet, call get_shootout later.",
};

const LIVE = new Set(["queued", "planning", "running"]);
const abs = (ctx: McpContext, url?: string) => (url?.startsWith("/") ? `${ctx.baseUrl}${url}` : url);

/** A compact verdict an agent can act on. */
export function summarize(s: Shootout, ctx: McpContext) {
  const winner = s.entries.find((e) => e.id === s.winnerId);
  return {
    id: s.id,
    url: `${ctx.baseUrl}/s/${s.id}`,
    status: s.status,
    done: !LIVE.has(s.status),
    brief: s.brief,
    kind: s.kind,
    category: s.category,
    round: s.round,
    checklist: s.requirements.map((r) => `${r.id}: ${r.text}`),
    winner: winner?.score
      ? {
          entryId: winner.id,
          model: winner.model,
          label: contender(winner.model)?.label ?? winner.model,
          grade: winner.score.grade,
          vouchScore: winner.score.total,
          sealed: s.entries.length > 1 && winner.score.total >= SEAL_THRESHOLD,
          mediaUrl: abs(ctx, winner.outputUrl),
        }
      : null,
    entries: s.entries.map((e) => ({
      entryId: e.id,
      model: e.model,
      status: e.status,
      grade: e.score?.grade,
      vouchScore: e.score?.total,
      matchesBrief: e.score?.fidelity,
      craft: e.score?.craft,
      aesthetics: e.score?.aesthetics,
      costUsd: e.renderCostUsd,
      renderSeconds: e.renderMs ? Math.round(e.renderMs / 100) / 10 : undefined,
      mediaUrl: abs(ctx, e.outputUrl),
      missed: e.judge?.checks.filter((c) => c.verdict !== "yes").map((c) => `${c.id} ${c.verdict}: ${c.note}`),
      defects: e.judge?.defects,
      error: e.error,
    })),
    spentUsd: Math.round(s.entries.reduce((t, e) => t + (e.renderCostUsd ?? 0) + (e.judge?.costUsd ?? 0), 0) * 10_000) / 10_000,
    ...(s.error ? { error: s.error } : {}),
  };
}

async function waitFor(id: string, seconds: unknown): Promise<Shootout> {
  const limit = Math.max(0, Math.min(240, Number(seconds) || 0)) * 1000;
  const until = Date.now() + limit;
  for (;;) {
    const s = (await store().get(id))!;
    if (!LIVE.has(s.status) || Date.now() >= until) return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export const TOOLS: Tool[] = [
  {
    name: "recommend_model",
    title: "Recommend a model",
    description:
      "Which Livepeer image or video model should render this kind of shot, optionally under a budget? Answered from blind-graded renders on the Vouch Board, not vendor claims. Free and instant.",
    inputSchema: {
      type: "object",
      properties: {
        kind: KIND,
        category: {
          type: "string",
          description: "Kind of shot. Image: product, portrait, landscape, typography, character, food, architecture. Video: product, nature, character, action. Omit for all.",
        },
        max_cost_usd: { type: "number", description: "Most you will pay per usable render, in USD." },
      },
    },
    annotations: { readOnlyHint: true },
    async run(a) {
      const out = await recommend({ kind: a.kind as string, category: a.category as string, maxCostUsd: a.max_cost_usd as number });
      return out ?? { error: "No graded model fits that budget yet. Try a higher max_cost_usd or omit category." };
    },
  },
  {
    name: "plan_shootout",
    title: "Plan a shootout",
    description:
      "Classify a brief and propose three contenders (best on the Board, best value, a challenger) with live Livepeer prices and network SLAs. Spends nothing. Use it to preview cost before run_shootout.",
    inputSchema: {
      type: "object",
      properties: { brief: { type: "string", description: "The shot, in plain words (8-600 characters)." }, kind: KIND },
      required: ["brief"],
    },
    annotations: { readOnlyHint: true },
    async run(a) {
      const plan = await planLineup(a.brief, a.kind);
      return {
        category: plan.category,
        estimateUsd: plan.estimateUsd,
        lineup: plan.lineup.map((p) => ({
          model: p.model,
          label: contender(p.model)?.label,
          role: p.role,
          reason: p.reason,
          priceUsd: estimateCostUsd(contender(p.model)!),
          networkP50Ms: p.sla?.p50Ms,
          networkSuccessRate: p.sla?.successRate,
        })),
      };
    },
  },
  {
    name: "run_shootout",
    title: "Run a shootout",
    description:
      "Render one brief on up to three models in parallel on Livepeer, grade each render blind against a checklist built from the brief, and return the verdict: winner, grades, what each render missed, cost and time, and media URLs. Spends real credit (images about $0.03-0.10 total, video about $1-2).",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "The shot, in plain words. Exact text in quotes, counts and placement make the comparison sharper." },
        kind: KIND,
        models: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
          description: "1-3 model ids (see list_models). Omit to use the lineup Vouch proposes.",
        },
        wait_seconds: WAIT,
      },
      required: ["brief"],
    },
    async run(a, ctx) {
      const kind = a.kind === "video" ? "video" : "image";
      validateBrief(a.brief);
      const models = Array.isArray(a.models) && a.models.length ? a.models : (await planLineup(a.brief, kind)).lineup.map((p) => p.model);
      validateModels(kind, models);
      checkRate(ctx.ip);
      const s = await createShootout({ brief: a.brief, kind, models });
      startShootout(s.id);
      return summarize(await waitFor(s.id, a.wait_seconds ?? (kind === "image" ? 90 : 0)), ctx);
    },
  },
  {
    name: "get_shootout",
    title: "Get a shootout",
    description: "Read a shootout's current state or final verdict by id. Poll this until done is true.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Shootout id from run_shootout." }, wait_seconds: WAIT },
      required: ["id"],
    },
    annotations: { readOnlyHint: true },
    async run(a, ctx) {
      const s = await store().get(String(a.id));
      if (!s) return { error: "Shootout not found." };
      return summarize(await waitFor(s.id, a.wait_seconds), ctx);
    },
  },
  {
    name: "refine_render",
    title: "Refine a render",
    description:
      "Give feedback on one render from a finished shootout. Vouch turns the feedback into new checklist items, rewrites the prompt using what the judge flagged, re-renders on the same model, and grades it again.",
    inputSchema: {
      type: "object",
      properties: {
        shootout_id: { type: "string" },
        entry_id: { type: "string", description: "Which render to refine, e.g. e1 (see entries[].entryId)." },
        feedback: { type: "string", description: "What should change (3-400 characters)." },
        wait_seconds: WAIT,
      },
      required: ["shootout_id", "entry_id", "feedback"],
    },
    async run(a, ctx) {
      checkRate(ctx.ip);
      const child = await createRefine({ parentId: String(a.shootout_id), entryId: a.entry_id, feedback: a.feedback });
      startShootout(child.id);
      return summarize(await waitFor(child.id, a.wait_seconds ?? (child.kind === "image" ? 90 : 0)), ctx);
    },
  },
  {
    name: "get_board",
    title: "Read the Board",
    description: "The leaderboard of Livepeer image or video models, ranked by blind-graded renders: grade, Vouch score, quality, cost per usable render, p50 time, win rate, reliability.",
    inputSchema: {
      type: "object",
      properties: { kind: KIND, category: { type: "string", description: "Kind of shot, or omit for all briefs." } },
    },
    annotations: { readOnlyHint: true },
    async run(a) {
      const kind = a.kind === "video" ? "video" : "image";
      const category = (a.category as string) || "all";
      const snap = await boardSnapshot();
      return {
        kind,
        category,
        totals: snap.totals,
        judgeAgreesWithPeople: snap.agreement,
        models: snap.rows
          .filter((r) => r.kind === kind && r.category === category)
          .map((r) => ({
            model: r.model,
            label: contender(r.model)?.label,
            grade: r.grade,
            vouchScore: r.meanScore,
            quality: r.meanQuality,
            costPerUsableUsd: r.costPerUsable,
            p50Ms: r.p50Ms,
            winRate: r.winRate,
            successRate: r.successRate,
            gradedRenders: r.n,
          })),
      };
    },
  },
  {
    name: "list_models",
    title: "List models",
    description: "Every model Vouch can put in a shootout, with its Livepeer capability id, vendor, tier and rate-card price per render.",
    inputSchema: { type: "object", properties: { kind: KIND } },
    annotations: { readOnlyHint: true },
    async run(a) {
      return contendersFor(a.kind === "video" ? "video" : "image").map((c) => ({
        id: c.id,
        label: c.label,
        vendor: c.vendor,
        tier: c.tier,
        priceUsd: estimateCostUsd(c),
        about: c.blurb,
      }));
    },
  },
];

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Handle one JSON-RPC message. Returns undefined for notifications. */
export async function handleRpc(msg: RpcRequest, ctx: McpContext): Promise<unknown | undefined> {
  if (!msg || typeof msg !== "object" || typeof msg.method !== "string") return err(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined;
  if (isNotification) return undefined;

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok(msg.id, {
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "vouch-studio", title: "Vouch Studio", version: "1.0.0" },
        instructions:
          "Vouch Studio picks the right Livepeer image or video model for a shot, with evidence. Start with recommend_model (free) or plan_shootout (free), then run_shootout to render and blind-grade up to three models. Read what each render missed, then refine_render the one you like.",
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, ...(annotations ? { annotations } : {}) })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return err(msg.id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await tool.run((msg.params?.arguments as Record<string, unknown>) ?? {}, ctx);
        const isError = !!out && typeof out === "object" && "error" in out && Object.keys(out).length === 1;
        return ok(msg.id, {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          ...(out && typeof out === "object" && !Array.isArray(out) ? { structuredContent: out } : { structuredContent: { items: out } }),
          isError,
        });
      } catch (e) {
        return ok(msg.id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
