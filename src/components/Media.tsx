/* eslint-disable @next/next/no-img-element */
export function Media({ url, kind, alt, className = "" }: { url: string; kind: "image" | "video"; alt: string; className?: string }) {
  return kind === "video" ? (
    <video src={url} className={className} controls muted loop playsInline preload="metadata" aria-label={alt} />
  ) : (
    <img src={url} alt={alt} className={className} loading="lazy" decoding="async" />
  );
}
