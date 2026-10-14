import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { MemoryStore } from '../services/keyValueStore';
import { createFakeApi, sampleTile } from '../test/fakeApi';
import { renderWithProviders } from '../test/render';
import { SearchPage } from './SearchPage';

describe('SearchPage', () => {
  it('remembers a search with results once, instead of re-saving it forever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writes = vi.spyOn(MemoryStore.prototype, 'set');
    const api = createFakeApi({ images: vi.fn(async () => ({ total: 1, tiles: [sampleTile(1)] })) });
    renderWithProviders(
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>,
      { api, route: '/search?t=blue_sky' },
    );
    expect(await screen.findByText(/1 result/)).toBeInTheDocument();
    const recentWrites = () => writes.mock.calls.filter(([key]) => key === 'recentSearches').length;
    const before = recentWrites();
    // Step through time so React can re-render (and re-run effects) between ticks.
    for (let tick = 0; tick < 12; tick++) await act(async () => vi.advanceTimersByTime(1300));
    expect(recentWrites() - before).toBe(1);
    vi.useRealTimers();
    writes.mockRestore();
  });

  it('sends a shuffle seed so the order stays put', async () => {
    const images = vi.fn(async () => ({ total: 1, tiles: [sampleTile(1)] }));
    const api = createFakeApi({ images });
    renderWithProviders(
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>,
      { api, route: '/search?t=blue_sky', random: () => 0.25 },
    );
    await screen.findByText(/1 result/);
    act(() => screen.getByRole('radio', { name: 'Shuffle' }).click());
    await vi.waitFor(() =>
      expect(images).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'random', seed: 250_000_000 })),
    );
  });
});
