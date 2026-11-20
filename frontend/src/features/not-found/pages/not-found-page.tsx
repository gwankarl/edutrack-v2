import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="w-full max-w-prose rounded-card border border-border bg-surface p-card shadow-sm"
    >
      <h1 className="text-display font-semibold tracking-tight text-brand" id="not-found-title">
        Page not found
      </h1>
      <p className="mt-3 text-base leading-body text-muted">
        The page you requested doesn’t exist.
      </p>
      <Link
        className="mt-4 inline-block font-medium text-brand underline underline-offset-4 hover:text-text"
        to="/"
      >
        Return to EduTrack
      </Link>
    </section>
  );
}
