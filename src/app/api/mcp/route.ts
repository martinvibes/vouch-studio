import { NextResponse } from "next/server";
import { clientIp } from "@/lib/http";
import { handleRpc, type McpContext } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function context(req: Request): McpContext {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { baseUrl: `${proto}://${host}`, ip: clientIp(req) };
}

/** MCP Streamable HTTP endpoint (stateless, JSON responses). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const ctx = context(req);
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, ctx)))).filter((r) => r !== undefined);
    return out.length ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
  }
  const out = await handleRpc(body as Parameters<typeof handleRpc>[0], ctx);
  return out === undefined ? new NextResponse(null, { status: 202 }) : NextResponse.json(out);
}

/** No server-initiated stream: this server is stateless. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
