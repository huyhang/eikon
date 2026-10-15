import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryStore } from '../services/keyValueStore';
import { createFakeApi, sampleTile } from '../test/fakeApi';
import { renderWithProviders } from '../test/render';
import { LibraryPage } from './LibraryPage';

const home = {
  recent: [sampleTile(1), sampleTile(2)],
  illustrators: [],
  collections: [],
  rediscover: [sampleTile(3)],
  totals: { images: 3, illustrators: 1, collections: 0 },
};

function renderLibrary(store = new MemoryStore()) {
  const api = createFakeApi({ home: vi.fn(async () => home) });
  return { store, ...renderWithProviders(<LibraryPage />, { api, store }) };
}

describe('LibraryPage', () => {
  it('folds a section away to its title, and remembers it next time', async () => {
    const { store, unmount } = renderLibrary();
    const toggle = await screen.findByRole('button', { name: 'Recently Added' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Open recent image 1' })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Open recent image 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rediscover' })).toHaveAttribute('aria-expanded', 'true');

    unmount();
    renderLibrary(store);
    expect(await screen.findByRole('button', { name: 'Recently Added' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Open recent image 1' })).toBeNull();
  });

  it('hides a folded section’s action and brings it back on unfolding', async () => {
    renderLibrary();
    const toggle = await screen.findByRole('button', { name: 'Rediscover' });
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('button', { name: 'Shuffle' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
  });
});
