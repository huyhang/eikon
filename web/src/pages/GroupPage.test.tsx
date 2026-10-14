import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { createFakeApi, sampleTile } from '../test/fakeApi';
import { renderWithProviders } from '../test/render';
import { GroupPage } from './GroupPage';

function renderGroup(route = '/illustrators/3') {
  const images = vi.fn(async () => ({ total: 1, tiles: [sampleTile(1)] }));
  const api = createFakeApi({
    images,
    group: vi.fn(async () => ({
      group: { id: 3, kind: 'illustrator' as const, name: 'Aiko', imageCount: 31, covers: [], latestAt: 0 },
      topTags: [
        { name: 'sky', category: 'general' as const, count: 12 },
        { name: 'night', category: 'general' as const, count: 8 },
      ],
    })),
  });
  renderWithProviders(
    <Routes>
      <Route path="/illustrators/:id" element={<GroupPage kind="illustrator" />} />
    </Routes>,
    { api, route },
  );
  return images;
}

describe('GroupPage', () => {
  it('filters the group in place by tapping a common tag, and back again', async () => {
    const images = renderGroup();
    const sky = await screen.findByRole('button', { name: /sky/, pressed: false });
    fireEvent.click(sky);
    await waitFor(() =>
      expect(images).toHaveBeenLastCalledWith(expect.objectContaining({ group: 3, tags: ['sky'] })),
    );
    expect(await screen.findByText('1 image of 31')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sky/, pressed: true }));
    await waitFor(() =>
      expect(images).toHaveBeenLastCalledWith(expect.not.objectContaining({ tags: ['sky'] })),
    );
  });

  it('keeps a tag from the URL visible even when it is not a common one', async () => {
    renderGroup('/illustrators/3?t=moon');
    expect(await screen.findByRole('button', { name: /moon/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'More…' })).toHaveAttribute('href', '/search?t=moon&in=3');
  });
});
