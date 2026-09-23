import { headers } from "next/headers";

export const metadata = { title: "API · Vouch Studio" };
export const dynamic = "force-dynamic";

const endpoints = (BASE: string): { method: string; path: string; what: string; example: string }[] => [
  {
    method: "GET",
    path: "/api/recommend?kind=image&category=typography&maxCostUsd=0.02",
    what: "Ask which model to use for a kind of shot under a budget. Answered from graded renders, with alternatives.",
    example: `curl "${BASE}/api/recommend?kind=image&category=typography&maxCostUsd=0.02"

{
  "recommendation": { "model": "gemini-image", "grade": "S", "vouchScore": 95,
                      "costPerUsableUsd": 0.0041, "p50Ms": 14433, "gradedRenders": 6 },
  "reason": "Gemini 2.5 Flash Image holds a S (95) on typography image briefs ...",
  "alternatives": [ ... ]
}`,
  },
  {
    method: "POST",
    path: "/api/preflight",
    what: "Classify a brief and get the proposed lineup with live Livepeer prices and network SLAs. Free.",
    example: `curl -X POST ${BASE}/api/preflight -H 'content-type: application/json' \\
  -d '{"brief":"A neon sign reading \\"OPEN LATE\\" above a ramen shop door","kind":"image"}'`,
  },
  {
    method: "POST",
    path: "/api/shootouts",
    what: "Start a shootout with one to three contenders. Returns an id straight away; the run continues on the server.",
    example: `curl -X POST ${BASE}/api/shootouts -H 'content-type: application/json' \\
  -d '{"brief":"...","kind":"image","models":["flux-dev","ideogram-v4","gemini-image"]}'

{ "id": "6d33521c981f" }`,
  },
  {
    method: "GET",
    path: "/api/shootouts/:id",
    what: "The whole shootout: checklist, every entry's render URL, cost, time, per-requirement verdicts, score breakdown, and the refine chain. Poll it while status is queued, planning or running.",
    example: `curl ${BASE}/api/shootouts/6d33521c981f`,
  },
  {
    method: "POST",
    path: "/api/shootouts/:id/refine",
    what: "Give feedback on one render. Starts a new round on the same model with a rewritten prompt and your feedback added to the checklist.",
    example: `curl -X POST ${BASE}/api/shootouts/6d33521c981f/refine -H 'content-type: application/json' \\
  -d '{"entryId":"e1","feedback":"heavier rain and a cat by the door"}'`,
  },
  {
    method: "POST",
    path: "/api/shootouts/:id/pick",
    what: "Record which render a person preferred. Feeds the judge-agreement number on the Board.",
    example: `curl -X POST ${BASE}/api/shootouts/6d33521c981f/pick -H 'content-type: application/json' -d '{"entryId":"e2"}'`,
  },
  {
    method: "GET",
    path: "/api/board?kind=image&category=product",
    what: "The Board as JSON: per-model aggregates overall and per category, totals, and judge/human agreement.",
    example: `curl "${BASE}/api/board?kind=video"`,
  },
];

export default async function ApiDocs() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return (
    <div className="wrap-narrow pt-12 pb-10">
      <h1 className="text-4xl sm:text-5xl">API</h1>
      <p className="mt-5 text-lg text-soft max-w-2xl leading-relaxed">
        Everything the Studio does is a JSON call, so another agent can ask Vouch which model to use before it spends anything, or run a
        shootout and read the verdict. No key needed. Shootouts are rate-limited per caller and share a daily spend ceiling.
      </p>
      <div className="mt-10 grid gap-10">
        {endpoints(base).map((e) => (
          <section key={e.path} aria-label={`${e.method} ${e.path}`}>
            <h2 className="text-base flex flex-wrap items-center gap-2" style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              <span className={`grade ${e.method === "GET" ? "grade-b" : "grade-a"} h-7 px-2 text-xs`} style={{ fontFamily: "var(--font-sans)" }}>{e.method}</span>
              <span className="break-all">{e.path}</span>
            </h2>
            <p className="mt-2 text-soft">{e.what}</p>
            <pre className="code mt-3">{e.example}</pre>
          </section>
        ))}
      </div>
    </div>
  );
}
