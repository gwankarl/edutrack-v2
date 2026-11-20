import { Link } from 'react-router';

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-page py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-lg font-semibold tracking-tight text-brand">EduTrack</span>

        <nav aria-label="Primary navigation">
          <Link
            className="rounded-control px-3 py-2 text-sm font-medium text-text hover:bg-canvas hover:text-brand"
            to="/"
          >
            Home
          </Link>
        </nav>
      </div>
    </header>
  );
}
