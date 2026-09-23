import { FIDELITY_CAP_BELOW, FIDELITY_CAP_SCORE, FLOORS, GRADE_THRESHOLDS, QUALITY_WEIGHTS, SEAL_THRESHOLD, VOUCH_WEIGHTS } from "@/engine/score";
import { JUDGE_MODEL, JUDGE_PASSES } from "@/engine/judge";
import { CHECKLIST_MODEL } from "@/engine/checklist";
import { money, secs } from "@/lib/format";

export const metadata = { title: "How it's judged · Vouch Studio" };

const w = (n: number) => `${Math.round(n * 100)}%`;

export default function Methodology() {
  return (
    <div className="wrap-narrow pt-12 pb-10">
      <h1 className="text-4xl sm:text-5xl">How it&apos;s judged</h1>
      <div className="prose-v mt-6 text-[1.05rem]">
        <p>
          A score is only worth something if you can see where it came from. Every number in Vouch Studio traces back to a render we paid for on
          the Livepeer network and a verdict you can read line by line.
        </p>

        <h2>1. Your brief becomes a checklist</h2>
        <p>
          <code className="inline">{CHECKLIST_MODEL}</code> splits the brief into four to eight requirements a viewer could confirm just by looking:
          subject, counts, colours, placement, and any quoted text word for word. Every modifier survives. &ldquo;Exactly four sesame bagels&rdquo;
          stays one requirement, so &ldquo;two bagels&rdquo; fails it.
        </p>

        <h2>2. The models render, in parallel</h2>
        <p>
          Each contender is called by its exact Livepeer capability name, so the model we name is the model that ran. We record what it cost
          and how long it took. A render that fails scores F and counts against that model&apos;s success rate. We never re-run a render to give it a second chance.
        </p>

        <h2>3. A blind judge grades each render</h2>
        <p>
          <code className="inline">{JUDGE_MODEL}</code> sees the render and the checklist, never the model&apos;s name. For each requirement it answers yes,
          partly or no, with a short piece of evidence. It also scores craft (anatomy, geometry, garbled text, artifacts) and aesthetics out of 10,
          and lists the flaws it saw. It runs {JUDGE_PASSES} independent passes and we merge them. When the passes disagree, their verdicts are averaged: a yes and a no become partly met, and the flaw notes from the doubtful pass are kept.
        </p>
        <p>Video is judged from three frames taken at 15%, 50% and 85% of the clip, so the judge can see motion and whether subjects stay consistent.</p>

        <h2>4. The score</h2>
        <p>
          <strong>Quality</strong> = {w(QUALITY_WEIGHTS.fidelity)} how well it matches the brief + {w(QUALITY_WEIGHTS.craft)} craft + {w(QUALITY_WEIGHTS.aesthetics)} aesthetics.
          Matching the brief is the share of requirements met, with partly-met ones counting half.
        </p>
        <p>
          <strong>Vouch score</strong> = {w(VOUCH_WEIGHTS.quality)} quality + {w(VOUCH_WEIGHTS.value)} value + {w(VOUCH_WEIGHTS.speed)} speed.
          Value and speed are measured on a log scale from a floor: {money(FLOORS.image.costUsd)} and {secs(FLOORS.image.ms)} for an image,
          {" "}{money(FLOORS.video.costUsd)} and {secs(FLOORS.video.ms)} for a video. Twice as fast or ten times cheaper is a visible step, not a rounding error.
        </p>
        <p>
          A render that misses the brief can&apos;t buy its way up with speed or price: below {FIDELITY_CAP_BELOW} on matching the brief, the score is capped at {FIDELITY_CAP_SCORE}.
        </p>
        <p>
          Grades: {GRADE_THRESHOLDS.map(([g, t]) => `${g} from ${t}`).join(", ")}, F below that. A shootout winner scoring {SEAL_THRESHOLD} or more gets the Vouch seal.
        </p>

        <h2>5. The Board learns from every shootout</h2>
        <p>
          Graded renders roll up per model, overall and per kind of shot. A render that failed counts as 0 in the model&apos;s Vouch score, because that is what you got when you called it. The next lineup is built from that record: the best-scoring model for
          your kind of brief, the best value among models above 70 quality, and a challenger that has been tested least, so each run also teaches the Board something.
        </p>
        <p>
          When you pick a different render than the judge did, we keep both. The Board reports how often the judge agrees with people, so you can decide how much to trust it.
        </p>

        <h2>What it doesn&apos;t do</h2>
        <ul>
          <li>A vision model is a strict, consistent reader, not a human art director. On easy briefs, strong models tie and value decides.</li>
          <li>Small samples are noisy. The Board shows how many renders each number rests on.</li>
          <li>Prices come from the Livepeer rate card and the cost the network reports for each call.</li>
        </ul>
      </div>
    </div>
  );
}
