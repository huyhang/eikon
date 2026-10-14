import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { createFakeApi, sampleDetail } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { TagEditor } from './TagEditor';

function setup(editing: boolean) {
  const api = createFakeApi();
  const handlers = { onEditingChange: vi.fn(), onSearch: vi.fn(), onAddToSearch: vi.fn() };
  renderWithProviders(<TagEditor detail={sampleDetail()} editing={editing} {...handlers} />, { api });
  return { api, ...handlers };
}

describe('TagEditor', () => {
  it('groups tags and marks manual ones', () => {
    setup(false);
    expect(screen.getByText('blue sky')).toBeInTheDocument();
    expect(screen.getAllByLabelText('added by you')).toHaveLength(1);
  });

  it('starts a search when a tag is tapped', () => {
    const { onSearch } = setup(false);
    fireEvent.click(screen.getByText('blue sky'));
    expect(onSearch).toHaveBeenCalledWith('blue_sky');
  });

  it('toggles edit mode', () => {
    const { onEditingChange } = setup(false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });

  it('removes a tag in edit mode', async () => {
    const { api } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: /Remove blue_sky/ }));
    await waitFor(() => expect(api.removeTag).toHaveBeenCalledWith(1, 'blue_sky'));
  });

  it.each([
    { input: 'sunset', expected: 'sunset' },
    { input: 'character:hatsune miku', expected: 'character:hatsune miku' },
  ])('adds "$input" on Enter', async ({ input, expected }) => {
    const { api } = setup(true);
    const field = screen.getByLabelText('Add tag');
    fireEvent.change(field, { target: { value: input } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(api.addTag).toHaveBeenCalledWith(1, expected));
  });
});
