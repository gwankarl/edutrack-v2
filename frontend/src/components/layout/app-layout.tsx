import { Outlet } from 'react-router';
import { SiteHeader } from './site-header';

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas font-sans text-text">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-page focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-brand"
        href="#main-content"
      >
        Skip to main content
      </a>

      <SiteHeader />

      <main
        className="flex flex-1 items-center justify-center px-page py-section"
        id="main-content"
        tabIndex={-1}
      >
        <Outlet />
      </main>
    </div>
  );
}
