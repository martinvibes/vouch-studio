import { notFound } from "next/navigation";
import { Arena } from "@/components/Arena";
import { contendersFor } from "@/engine/contenders";
import { shootoutView } from "@/lib/shootoutView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const view = await shootoutView((await params).id);
  return { title: view ? `“${view.shootout.brief.slice(0, 60)}” · Vouch Studio` : "Shootout · Vouch Studio" };
}

export default async function ArenaPage({ params }: { params: Promise<{ id: string }> }) {
  const view = await shootoutView((await params).id);
  if (!view) notFound();
  const labels = Object.fromEntries(contendersFor(view.shootout.kind).map((c) => [c.id, { label: c.label, vendor: c.vendor }]));
  return <Arena initial={view} labels={labels} />;
}
