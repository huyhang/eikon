import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { HomeResponse } from '@eikon/shared';
import { AppRoutes } from './App';
import { createFakeApi, sampleTile } from './test/fakeApi';
import { renderWithProviders } from './test/render';

const home: HomeResponse = {
  recent: [sampleTile(1)],
  illustrators: [
    { id: 3, kind: 'illustrator', name: 'Mika', imageCount: 1, covers: [sampleTile(1)], latestAt: 0 },
  ],
  collections: [],
  rediscover: [],
  totals: { images: 1, illustrators: 1, collections: 0 },
};

describe('AppRoutes', () => {
  it.each([
    {
      name: 'locked',
      auth: { required: true, authenticated: false, numeric: true },
      expectText: 'Enter passcode',
    },
    {
      name: 'signed in',
      auth: { required: true, authenticated: true, numeric: true },
      expectText: 'Recently Added',
    },
    {
      name: 'no passcode configured',
      auth: { required: false, authenticated: false, numeric: false },
      expectText: 'Recently Added',
    },
  ])('$name → shows "$expectText"', async ({ auth, expectText }) => {
    const api = createFakeApi({ authStatus: vi.fn(async () => auth), home: vi.fn(async () => home) });
    renderWithProviders(<AppRoutes />, { api });
    expect(await screen.findByText(expectText)).toBeInTheDocument();
  });

  it('shows the first-run guide for an empty library', async () => {
    renderWithProviders(<AppRoutes />);
    expect(await screen.findByText('Welcome to Eikon')).toBeInTheDocument();
  });

  it('routes to the search page with chips from the URL', async () => {
    renderWithProviders(<AppRoutes />, { route: '/search?t=blue_sky&x=night' });
    expect(await screen.findByRole('button', { name: /blue sky: included/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /night: excluded/ })).toBeInTheDocument();
  });

  it('renders not found for unknown paths', async () => {
    renderWithProviders(<AppRoutes />, { route: '/nope' });
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
