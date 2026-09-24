import Link from "next/link";
import { headers } from "next/headers";
import { CodeBlock } from "@/components/CodeBlock";
import { TOOLS } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Docs · Vouch Studio" };

const SECTIONS = [
  ["overview", "What it is"],
  ["quick-start", "Quick start"],
  ["shootout", "Run a shootout"],
  ["verdict", "Read a verdict"],
  ["refine", "Refine a render"],
  ["board", "The Board"],
  ["mcp", "Connect an agent (MCP)"],
  ["api", "REST API"],
  ["scoring", "How scoring works"],
  ["limits", "Limits and costs"],
  ["faq", "FAQ"],
] as const;

export default async function DocsPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const mcpUrl = `${base}/api/mcp`;

  return (
    <div className="wrap pt-12 pb-10 grid gap-10 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:block">
        <nav aria-label="On this page" className="sticky top-24 grid gap-0.5 text-sm">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="px-3 py-1.5 rounded-lg text-soft hover:text-ink hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]">
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <article className="docs min-w-0 max-w-[72ch]">
        <h1 className="text-4xl sm:text-5xl">Docs</h1>
        <p className="lead">Everything you need to use Vouch Studio in the browser, from an AI agent, or over HTTP.</p>

        <section id="overview">
          <h2>What it is</h2>
          <p>
            Vouch Studio helps you choose the right AI model for an image or video. You describe the shot once. It renders that shot on up to three
            models at the same time on the <strong>Livepeer network</strong>, grades every render blind against your description, and shows you the
            winner with the evidence: what each render got right, what it missed, what it cost and how long it took.
          </p>
          <p>Every result also feeds the Board, a public ranking of models built only from real, graded renders.</p>
        </section>

        <section id="quick-start">
          <h2>Quick start</h2>
          <ol className="steps">
            <li><strong>Describe the shot</strong> on the <Link href="/">Studio</Link> page, or click an example.</li>
            <li><strong>Check the lineup.</strong> Vouch proposes three models with their price, speed and success rate. Swap any you like.</li>
            <li><strong>Run the shootout.</strong> Images take about 30 seconds, video one to five minutes. Watch the grades land.</li>
          </ol>
          <p className="note">No sign-up and no API key. The demo has a daily spending limit, so if a run is refused, browse the Board and try again later.</p>
        </section>

        <section id="shootout">
          <h2>Run a shootout</h2>
          <p>A shootout is one description rendered by several models, then judged. Here is what happens after you click Run:</p>
          <ol className="steps">
            <li><strong>Checklist.</strong> A text model breaks your description into 4–8 things anyone could check by looking: the subject, counts, colours, placement and any exact words.</li>
            <li><strong>Render.</strong> Each model renders your description in parallel on Livepeer.</li>
            <li><strong>Judge.</strong> A vision model looks at each render without knowing which model made it, and marks every checklist item as met, partly met or missed.</li>
            <li><strong>Verdict.</strong> Each render gets a grade from S to F. The best one wins.</li>
          </ol>
          <p className="note">
            <strong>Tip:</strong> the more specific your description, the more the models differ. Exact text in quotes (<em>a sign reading &quot;OPEN LATE&quot;</em>),
            counts (<em>exactly four bagels</em>) and placement (<em>an orchid to its left</em>) separate strong models from weak ones.
          </p>
        </section>

        <section id="verdict">
          <h2>Read a verdict</h2>
          <dl className="defs">
            <dt>Grade stamp</dt><dd>The letter (S, A, B, C, D, F) and the Vouch score out of 100, pressed onto each render when its verdict lands.</dd>
            <dt>Score bars</dt><dd>Matches the brief, craft, aesthetics, value and speed, each out of 100.</dd>
            <dt>Checklist</dt><dd>A tick means met, a dash partly met, a cross missed. Missed items show the judge&apos;s note, so you can see why.</dd>
            <dt>Flaws</dt><dd>Specific problems the judge saw, such as garbled text or an extra finger.</dd>
            <dt>Judge&apos;s pick</dt><dd>The highest score. If it scores 80 or more, the shootout shows the Vouch seal.</dd>
            <dt>Your pick</dt><dd>Click <em>I prefer this one</em> to record your choice. It never changes the scores, but the Board reports how often people agree with the judge.</dd>
          </dl>
        </section>

        <section id="refine">
          <h2>Refine a render</h2>
          <p>
            Like a render but want changes? Click <strong>Refine this render</strong> and say what should change, such as <em>make the lettering gold</em>.
            Vouch adds your feedback to the checklist, rewrites the prompt using what the judge flagged, and runs a new round on the same model.
            The trail at the top of the page links every round and shows its grade.
          </p>
        </section>

        <section id="board">
          <h2>The Board</h2>
          <p>
            The <Link href="/board">Board</Link> ranks models by every graded render. Filter by image or video and by kind of shot (product, portrait,
            typography…). Columns show the grade, Vouch score, quality, how well renders match the brief, cost per usable render, typical render time,
            win rate against other models, and reliability. A failed render counts as 0, so an unreliable model can&apos;t top the Board.
          </p>
        </section>

        <section id="mcp">
          <h2>Connect an agent (MCP)</h2>
          <p>
            Vouch Studio is also an <strong>MCP server</strong>. Connect it to Claude, Cursor or any MCP client, and your agent can ask which model to
            use, run shootouts and read verdicts on its own.
          </p>
          <CodeBlock label="Server URL (Streamable HTTP, no key needed)" code={mcpUrl} />
          <CodeBlock label="Claude Code" code={`claude mcp add --transport http vouch-studio ${mcpUrl}`} />
          <CodeBlock label="Cursor: .cursor/mcp.json" code={JSON.stringify({ mcpServers: { "vouch-studio": { url: mcpUrl } } }, null, 2)} />
          <CodeBlock
            label="Claude Desktop: claude_desktop_config.json"
            code={JSON.stringify({ mcpServers: { "vouch-studio": { command: "npx", args: ["-y", "mcp-remote", mcpUrl] } } }, null, 2)}
          />

          <h3>Tools</h3>
          <div className="panel overflow-x-auto mt-3">
            <table className="table">
              <thead><tr><th>Tool</th><th>What it does</th><th>Cost</th></tr></thead>
              <tbody>
                {TOOLS.map((t) => (
                  <tr key={t.name}>
                    <td><code className="inline">{t.name}</code></td>
                    <td className="!whitespace-normal min-w-[18rem]">{t.description.split(". ")[0]}.</td>
                    <td>{t.annotations?.readOnlyHint ? "Free" : "Spends credit"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Try asking your agent</h3>
          <ul>
            <li>&ldquo;Which Livepeer model is best for product shots under 2 cents?&rdquo;</li>
            <li>&ldquo;Run a shootout for a poster reading &apos;VISIT LISBON&apos; with a red tram, and tell me which model won and why.&rdquo;</li>
            <li>&ldquo;Refine the winner: make the sky sunset orange.&rdquo;</li>
          </ul>
        </section>

        <section id="api">
          <h2>REST API</h2>
          <p>Every feature is also a plain JSON endpoint. No key is needed.</p>
          <CodeBlock label="Which model should I use?" code={`curl "${base}/api/recommend?kind=image&category=typography&maxCostUsd=0.02"`} />
          <p>
            Full reference with every endpoint and example: <Link href="/api-docs">API reference</Link>.
          </p>
        </section>

        <section id="scoring">
          <h2>How scoring works</h2>
          <pre className="code mt-3">{`Quality     = 60% matches the brief + 25% craft + 15% aesthetics
Vouch score = 70% quality + 20% value + 10% speed`}</pre>
          <ul>
            <li>A render that matches less than half the brief is capped at a C, however cheap or fast it is.</li>
            <li>Value and speed use a log scale, so ten times cheaper or twice as fast is a visible step.</li>
            <li>Grades: S from 92, A from 80, B from 66, C from 52, D from 38, F below.</li>
          </ul>
          <p>The full method, including how the judge works, is on <Link href="/methodology">How it&apos;s judged</Link>.</p>
        </section>

        <section id="limits">
          <h2>Limits and costs</h2>
          <ul>
            <li>Each visitor can run 6 shootouts (or refine rounds) per hour.</li>
            <li>The demo stops spending when it reaches its daily limit. Everything free (Board, recommendations, planning) keeps working.</li>
            <li>A typical image shootout costs $0.03–0.10 in Livepeer credit; a video shootout about $1–2.</li>
          </ul>
        </section>

        <section id="faq">
          <h2>FAQ</h2>
          <dl className="defs">
            <dt>Is the judge fair?</dt>
            <dd>It never sees the model&apos;s name, and it grades every render against the same checklist. It is still an AI, so the Board reports how often people agree with it.</dd>
            <dt>Why did a cheap model win?</dt>
            <dd>When several renders meet the whole brief, value and speed decide. That is the point: don&apos;t pay more for the same result.</dd>
            <dt>What if a render fails?</dt>
            <dd>It scores F and counts against that model&apos;s reliability. Vouch never re-runs a render that started, because you would pay twice.</dd>
            <dt>Where do the prices come from?</dt>
            <dd>The cost Livepeer reports for each call, and the Livepeer rate card for estimates.</dd>
          </dl>
        </section>
      </article>
    </div>
  );
}
