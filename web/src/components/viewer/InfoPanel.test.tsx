import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { createFakeApi, sampleDetail, sampleTile } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { InfoPanel } from './InfoPanel';

function renderPanel(options: { similar: boolean; detail?: ReturnType<typeof sampleDetail> }) {
  const api = createFakeApi({
    images: vi.fn(async () => ({ total: 2, tiles: [sampleTile(8), sampleTile(9)] })),
  });
  renderWithProviders(
    <InfoPanel
      detail={options.detail ?? sampleDetail({ id: 5, rating: 'sensitive' })}
      wide
      editing={false}
      onEditingChange={() => {}}
      onClose={() => {}}
      onSearch={() => {}}
      onAddToSearch={() => {}}
      similar={options.similar}
    />,
    { api },
  );
  return api;
}

describe('InfoPanel', () => {
  it.each([
    { label: 'override to General', choice: 'general', expected: 'general' },
    { label: 'back to automatic', choice: 'auto', expected: null },
  ])('rating control: $label', async ({ choice, expected }) => {
    const api = renderPanel({
      similar: false,
      detail: sampleDetail({ id: 5, rating: 'sensitive', ratingOverridden: true }),
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Rating' }), { target: { value: choice } });
    await waitFor(() => expect(api.setRating).toHaveBeenCalledWith(5, expected));
  });

  it('shows the automatic rating it would fall back to', () => {
    renderPanel({ similar: false });
    expect(screen.getByRole('option', { name: 'Automatic (Sensitive)' })).toBeInTheDocument();
  });

  it('shows a "More like this" strip when similar search is available', async () => {
    const api = renderPanel({ similar: true });
    expect(await screen.findByRole('link', { name: 'See all' })).toHaveAttribute('href', '/search?like=5');
    expect(api.images).toHaveBeenCalledWith(expect.objectContaining({ like: 5, limit: 8 }));
  });

  it('hides the strip (and asks for nothing) without similar search', () => {
    const api = renderPanel({ similar: false });
    expect(screen.queryByText('More like this')).toBeNull();
    expect(api.images).not.toHaveBeenCalled();
  });
});
