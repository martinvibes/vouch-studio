/* eslint-disable @next/next/no-img-element */
export function Media({ url, kind, alt, className = "", thumb = false }: { url: string; kind: "image" | "video"; alt: string; className?: string; thumb?: boolean }) {
  if (kind === "image") return <img src={url} alt={alt} className={className} loading="lazy" decoding="async" />;
  return thumb ? (
    <video src={url} className={className} muted loop playsInline autoPlay preload="metadata" aria-label={alt} />
  ) : (
    <video src={url} className={className} controls muted loop playsInline autoPlay preload="metadata" aria-label={alt} />
  );
}
