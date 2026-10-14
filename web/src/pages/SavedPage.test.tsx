import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { createFakeApi, sampleTile } from '../test/fakeApi';
import { renderWithProviders } from '../test/render';
import { SavedPage } from './SavedPage';

const saved = {
  id: 1,
  name: 'blue sky · night',
  query: { tags: ['blue_sky', 'night'], exclude: [] },
  createdAt: 0,
};

function renderSaved(searches: (typeof saved)[], favorites: number) {
  const api = createFakeApi({
    savedSearches: vi.fn(async () => searches),
    images: vi.fn(async () => ({
      total: favorites,
      tiles: Array.from({ length: favorites }, (_v, i) => sampleTile(i + 1)),
    })),
  });
  return renderWithProviders(
    <Routes>
      <Route path="/saved" element={<SavedPage />} />
    </Routes>,
    { api, route: '/saved' },
  );
}

describe('SavedPage', () => {
  it('lists pinned searches as links that open the search, and favourites', async () => {
    renderSaved([saved], 2);
    const link = await screen.findByRole('link', { name: /blue sky · night/ });
    expect(link).toHaveAttribute('href', '/search?t=blue_sky&t=night');
    expect(await screen.findByText(/1 pinned search · 2 favorites/)).toBeInTheDocument();
  });

  it.each([
    { label: 'no pinned searches', searches: [], favorites: 1, text: /on a search to pin it here/ },
    { label: 'no favorites', searches: [saved], favorites: 0, text: 'No favorites yet' },
  ])('explains $label', async ({ searches, favorites, text }) => {
    renderSaved(searches, favorites);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
