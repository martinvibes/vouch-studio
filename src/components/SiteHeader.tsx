import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Studio" },
  { href: "/board", label: "Board" },
  { href: "/docs", label: "Docs" },
  { href: "/api-docs", label: "API" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap flex items-center justify-between gap-4 py-4">
        <Link href="/" className="wordmark shrink-0" aria-label="Vouch Studio home">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
            <circle cx="16" cy="16" r="14.5" fill="var(--gold)" stroke="var(--hard)" strokeWidth="1.5" />
            <path d="M9.5 16.5l4.2 4.2 8.8-9.4" fill="none" stroke="var(--on-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="whitespace-nowrap">Vouch<span className="text-soft font-medium"> Studio</span></span>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1 min-w-0 overflow-x-auto" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link">
              {n.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="wrap py-12 text-sm text-mute flex flex-wrap justify-between gap-3 border-t border-line mt-24">
      <span>Every render and every verdict runs on the Livepeer network. Nothing on the Board is self-reported.</span>
      <a className="underline decoration-line-strong underline-offset-4 hover:text-ink" href="https://github.com/martinvibes/vouch-studio">Source</a>
    </footer>
  );
}
