import Link from "next/link";

export function AppHeader() {
  return (
    <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-2.5">
      <div className="flex items-baseline gap-3">
        <Link href="/projects" className="font-[family-name:var(--font-dm)] text-xl font-semibold tracking-tight text-accent">
          FlexiPMT
        </Link>
        <span className="text-sm text-muted">
          Presiometrie OYO · ISO 22476-5
        </span>
      </div>
      <nav className="flex gap-2 text-sm">
        <Link href="/projects" className="rounded border border-line px-2.5 py-1 hover:bg-accent-soft">
          Proiecte
        </Link>
        <Link href="/settings" className="rounded border border-line px-2.5 py-1 hover:bg-accent-soft">
          Setări
        </Link>
      </nav>
    </header>
  );
}
