import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './app';

describe('application shell and routes', () => {
  it('renders the home page and layout, supports keyboard access, and navigates back from not found', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'EduTrack' })).toBeVisible();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();

    await user.tab();

    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('#main-content');

    window.history.pushState({}, '', '/missing-test-route');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Return to EduTrack' }));

    expect(await screen.findByRole('heading', { name: 'EduTrack' })).toBeVisible();
  });
});
