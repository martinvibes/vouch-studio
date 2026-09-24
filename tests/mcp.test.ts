import { describe, expect, it } from "vitest";
import { handleRpc, TOOLS } from "@/lib/mcp";

const ctx = { baseUrl: "https://vouch.test", ip: "1.2.3.4" };
type Rpc = { result?: Record<string, any>; error?: { code: number; message: string } };

describe("MCP server", () => {
  it("negotiates the protocol version and advertises tools", async () => {
    const init = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ctx)) as Rpc;
    expect(init.result?.protocolVersion).toBe("2025-03-26");
    expect(init.result?.capabilities.tools).toBeDefined();
    const unknown = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ctx)) as Rpc;
    expect(unknown.result?.protocolVersion).toBe("2025-06-18");
  });

  it("ignores notifications and rejects unknown methods", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeUndefined();
    expect(((await handleRpc({ jsonrpc: "2.0", id: 3, method: "nope" }, ctx)) as Rpc).error?.code).toBe(-32601);
  });

  it("lists every tool with an object input schema", async () => {
    const res = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/list" }, ctx)) as Rpc;
    const names = res.result?.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(TOOLS.map((t) => t.name));
    for (const t of res.result?.tools) expect(t.inputSchema.type).toBe("object");
  });

  it("returns tool errors as isError results, not protocol errors", async () => {
    const res = (await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "run_shootout", arguments: { brief: "hi" } } }, ctx)) as Rpc;
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content[0].text).toMatch(/at least 8/);
  });

  it("answers list_models and recommend_model from the seed Board", async () => {
    const models = (await handleRpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "list_models", arguments: { kind: "video" } } }, ctx)) as Rpc;
    expect(models.result?.structuredContent.items.length).toBe(6);
    const rec = (await handleRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "recommend_model", arguments: { kind: "image" } } }, ctx)) as Rpc;
    expect(rec.result?.isError).toBe(false);
    expect(rec.result?.structuredContent.recommendation.model).toBeTruthy();
  });
});
