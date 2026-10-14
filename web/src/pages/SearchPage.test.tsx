import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { MemoryStore } from '../services/keyValueStore';
import { ApiRequestError } from '../api/client';
import { createFakeApi, idleStatus, sampleTile } from '../test/fakeApi';
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
    // Phone layout (jsdom has no wide viewport): sorting sits behind the Filters button.
    act(() => screen.getByRole('button', { name: 'Filters' }).click());
    act(() => screen.getByRole('radio', { name: 'Shuffle' }).click());
    await vi.waitFor(() =>
      expect(images).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'random', seed: 250_000_000 })),
    );
  });
});

const route = (path: string, api = createFakeApi()) =>
  renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
    </Routes>,
    { api, route: path },
  );

describe('SearchPage ranked search', () => {
  it('describes in words: sends the text and shows best matches', async () => {
    const images = vi.fn(async () => ({ total: 2, tiles: [sampleTile(1), sampleTile(2)] }));
    route('/search?q=red%20sky', createFakeApi({ images }));
    expect(await screen.findByText('2 best matches')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /describe/i })).toHaveValue('red sky');
    expect(images).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'red sky' }));
    expect(screen.queryByRole('button', { name: /pin this search/i })).toBeNull();
  });

  it('shows the reference image for "more like this" and can clear it', async () => {
    const images = vi.fn(async () => ({ total: 1, tiles: [sampleTile(9)] }));
    route('/search?like=4', createFakeApi({ images }));
    expect(await screen.findByText('More like this')).toBeInTheDocument();
    expect(images).toHaveBeenLastCalledWith(expect.objectContaining({ like: 4 }));
    act(() => screen.getByRole('button', { name: /stop matching/i }).click());
    expect(await screen.findByText('Popular tags')).toBeInTheDocument();
  });

  it('explains why a ranked search is unavailable', async () => {
    const images = vi.fn(async () => {
      throw new ApiRequestError(503, 'Describe search needs gpubox with an embedding model.');
    });
    route('/search?q=sea', createFakeApi({ images }));
    expect(await screen.findByText(/needs gpubox/)).toBeInTheDocument();
  });

  it.each([
    { label: 'describe available', describeAvailable: true, toggle: true },
    { label: 'gpubox without embeddings', describeAvailable: false, toggle: false },
  ])('offers the Describe mode only when $label', async ({ describeAvailable, toggle }) => {
    const status = vi.fn(async () => ({
      ...idleStatus,
      tagging: { ...idleStatus.tagging, describeAvailable },
    }));
    route('/search', createFakeApi({ status }));
    await screen.findByText('Popular tags');
    await vi.waitFor(() => expect(status).toHaveBeenCalled());
    await vi.waitFor(() => expect(Boolean(screen.queryByRole('radio', { name: 'Describe' }))).toBe(toggle));
  });
});
