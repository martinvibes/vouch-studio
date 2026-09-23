import {
  extractCost,
  extractElapsedMs,
  extractErrorMessage,
  extractJobId,
  extractStatus,
  extractText,
  extractUrl,
  isToolError,
} from "./parse";

/**
 * Thin client for the Livepeer Agent raw MCP surface
 * (https://agent.livepeer.org/api/mcp). Streamable-HTTP JSON-RPC, stateless:
 * every call is a POST of `tools/call`. The bearer is optional — without it the
 * network serves keyless demo credits for this server's address.
 *
 * Server-only: the key never reaches the browser.
 */

export class LivepeerError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LivepeerError";
  }
}

export type RunResult = {
  url?: string;
  text?: string;
  costUsd?: number;
  /** Provider-side render time when the network reports it (async jobs). */
  providerMs?: number;
  raw: unknown;
};

export type CapabilitySla = {
  name: string;
  priceUsd: number;
  unit: string;
  p50Ms?: number;
  p95Ms?: number;
  successRate?: number;
  samples?: number;
  effectiveCostUsd?: number;
  health: string;
  available: boolean;
};

const POLL_MS = 5000;
const TERMINAL_FAIL = new Set(["failed", "error", "cancelled", "canceled"]);
const TERMINAL_OK = new Set(["done", "completed", "complete", "succeeded", "success", "ready"]);

export class LivepeerClient {
  private slaCache = new Map<string, { at: number; sla: CapabilitySla }>();

  constructor(
    private readonly endpoint = "https://agent.livepeer.org/api/mcp",
    private readonly bearer?: string,
  ) {}

  /** One JSON-RPC round trip. Tolerates an SSE-framed reply. */
  async rpc(method: string, params: Record<string, unknown>, timeoutMs = 60_000): Promise<unknown> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(this.bearer ? { authorization: `Bearer ${this.bearer}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok) throw new LivepeerError(`Livepeer HTTP ${res.status}: ${body.slice(0, 200)}`, "http", res.status >= 500);
    return parseBody(body);
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    const payload = await this.rpc("tools/call", { name, arguments: args }, timeoutMs);
    if (isToolError(payload)) {
      const sc = (payload as { result?: { structuredContent?: { code?: string; retryable?: boolean } } }).result
        ?.structuredContent;
      throw new LivepeerError(extractErrorMessage(payload), sc?.code, sc?.retryable ?? false);
    }
    return payload;
  }

  /**
   * Run a capability. Slow capabilities come back as a job; we poll
   * `get_create_media` until it lands. We never re-submit on a stalled poll —
   * the provider would bill the second render too.
   */
  async runCapability(args: {
    capability: string;
    prompt?: string;
    inputs?: Record<string, unknown>;
    sourceUrl?: string;
    timeoutS: number;
    sessionId: string;
    async?: boolean;
  }): Promise<RunResult> {
    const submit = () =>
      this.callTool(
        "run_capability",
        {
          capability: args.capability,
          ...(args.prompt ? { prompt: args.prompt } : {}),
          ...(args.inputs ? { inputs: args.inputs } : {}),
          ...(args.sourceUrl ? { source_url: args.sourceUrl } : {}),
          timeout: args.timeoutS,
          session_id: args.sessionId,
          ...(args.async !== undefined ? { async: args.async } : {}),
        },
        (args.async ? 60 : args.timeoutS + 30) * 1000,
      );

    // Retry only what the network itself flags as retryable (e.g. a transient
    // SDK fetch failure before dispatch). A client-side timeout is NOT retried:
    // the provider may still finish and bill that render.
    let submitted: unknown;
    for (let attempt = 0; ; attempt++) {
      try {
        submitted = await submit();
        break;
      } catch (err) {
        // Pre-dispatch refusals like "budget store unavailable — try again
        // shortly" arrive with retryable:false but are safe to retry.
        const transient = err instanceof Error && /try again|temporarily|unavailable|fetch failed/i.test(err.message);
        const retryable = err instanceof LivepeerError && err.code !== "http" && (err.retryable || transient);
        if (!retryable || attempt >= 2) throw err;
        await sleep(1500 * (attempt + 1));
      }
    }

    const jobId = extractJobId(submitted);
    const inlineUrl = extractUrl(submitted);
    if (!jobId || inlineUrl || extractStatus(submitted) === "done") {
      return toResult(submitted);
    }

    const deadline = Date.now() + (args.timeoutS + 60) * 1000;
    let transientFailures = 0;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      let polled: unknown;
      try {
        polled = await this.callTool("get_create_media", { job_id: jobId }, 30_000);
        transientFailures = 0;
      } catch (err) {
        // A failed *poll* is not a failed render. Keep polling a few times.
        if (err instanceof LivepeerError && err.code !== "http" && !err.retryable) throw err;
        if (++transientFailures > 5) throw err;
        continue;
      }
      const status = extractStatus(polled);
      if (TERMINAL_FAIL.has(status)) {
        const sc = (polled as { result?: { structuredContent?: { error?: string } } }).result?.structuredContent;
        throw new LivepeerError(sc?.error || `Render ${status}`, status);
      }
      if (TERMINAL_OK.has(status) && extractUrl(polled)) return toResult(polled, submitted);
    }
    throw new LivepeerError(`Render still running after ${args.timeoutS + 60}s (job ${jobId})`, "timeout");
  }

  /** Price + measured SLA for one capability. Free; cached for 5 minutes. */
  async describe(name: string): Promise<CapabilitySla> {
    const hit = this.slaCache.get(name);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.sla;
    const payload = await this.callTool("describe_capability", { name }, 20_000);
    const sc = ((payload as { result?: { structuredContent?: Record<string, unknown> } }).result?.structuredContent ??
      {}) as Record<string, any>;
    const sla: CapabilitySla = {
      name,
      priceUsd: Number(sc.display_price_usd ?? 0),
      unit: String(sc.unit_kind ?? sc.pricing?.unit_kind ?? "call"),
      p50Ms: sc.sla?.p50_ms ?? undefined,
      p95Ms: sc.sla?.p95_ms ?? undefined,
      successRate: typeof sc.sla?.success_rate === "number" ? sc.sla.success_rate : undefined,
      samples: typeof sc.sla?.samples === "number" ? sc.sla.samples : undefined,
      effectiveCostUsd: typeof sc.effective_cost_usd === "number" ? sc.effective_cost_usd : undefined,
      health: String(sc.health ?? "unknown"),
      available: sc.availability === "available",
    };
    this.slaCache.set(name, { at: Date.now(), sla });
    return sla;
  }

  /** Re-host bytes on Livepeer storage so a capability can read them. */
  async uploadBase64(data: Buffer, mime: string, filename: string): Promise<string> {
    const payload = await this.callTool(
      "upload",
      { data: data.toString("base64"), mime_type: mime, filename },
      60_000,
    );
    const url = extractUrl(payload) ?? findAnyUrl(payload);
    if (!url) throw new LivepeerError("Upload returned no hosted URL", "upload");
    return url;
  }
}

function toResult(payload: unknown, submitted?: unknown): RunResult {
  return {
    url: extractUrl(payload),
    text: extractText(payload) || undefined,
    costUsd: extractCost(payload) ?? (submitted ? extractCost(submitted) : undefined),
    providerMs: extractElapsedMs(payload),
    raw: payload,
  };
}

function findAnyUrl(payload: unknown): string | undefined {
  return JSON.stringify(payload).match(/https:\/\/[^"'\s\\]+/)?.[0];
}

function parseBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  // SSE framing: take the last `data:` line that holds JSON.
  const dataLines = trimmed
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(dataLines[i]);
    } catch {
      /* keep looking */
    }
  }
  throw new LivepeerError(`Unreadable Livepeer response: ${trimmed.slice(0, 120)}`, "parse");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let singleton: LivepeerClient | undefined;

export function livepeer(): LivepeerClient {
  singleton ??= new LivepeerClient(
    process.env.LIVEPEER_MCP_URL || "https://agent.livepeer.org/api/mcp",
    process.env.LIVEPEER_API_KEY || undefined,
  );
  return singleton;
}
