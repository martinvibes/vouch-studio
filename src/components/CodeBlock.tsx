"use client";

import { useState } from "react";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3">
      {label && <p className="label mb-1.5">{label}</p>}
      <pre className="code pr-20">{code}</pre>
      <button
        type="button"
        className="btn btn-ghost btn-sm absolute right-2 bottom-2 !h-8 !px-3 bg-[var(--surface)]"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
