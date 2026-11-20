export function HomePage() {
  return (
    <section
      aria-labelledby="home-title"
      className="w-full max-w-prose rounded-card border border-border bg-surface p-card shadow-sm"
    >
      <h1 className="text-display font-semibold tracking-tight text-brand" id="home-title">
        EduTrack
      </h1>
      <p className="mt-3 text-base leading-body text-muted">Learning starts here.</p>
    </section>
  );
}
