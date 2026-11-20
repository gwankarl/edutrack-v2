import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from './providers';

function QueryClientConsumer() {
  useQueryClient();

  return <p>Query provider is available.</p>;
}

describe('AppProviders', () => {
  it('makes the application QueryClient available to descendants', () => {
    render(
      <AppProviders>
        <QueryClientConsumer />
      </AppProviders>,
    );

    expect(screen.getByText('Query provider is available.')).toBeVisible();
  });
});
