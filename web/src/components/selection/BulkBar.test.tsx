import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createFakeApi, sampleTile } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { ImageCollection } from '../grid/ImageCollection';
import { BulkBar, SelectButton } from './BulkBar';

const tiles = [sampleTile(1), sampleTile(2), sampleTile(3)];

// jsdom does no layout; give elements a width so the justified grid lays out a row of tiles.
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 }),
);
afterAll(
  () => widthDescriptor && Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor),
);

const tile = async (n: number) => screen.findByRole('button', { name: new RegExp(`image ${n}$`, 'i') });

function renderGrid() {
  const api = createFakeApi();
  renderWithProviders(
    <>
      <SelectButton />
      <ImageCollection tiles={tiles} contextKey="grid" primary />
      <BulkBar />
    </>,
    { api },
  );
  return api;
}

describe('multi-select', () => {
  it('⌘-click selects, shift-click extends, and Favorite applies to the selection', async () => {
    const api = renderGrid();
    fireEvent.click(await tile(1), { metaKey: true });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(await tile(3), { shiftKey: true });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }));
    await waitFor(() => expect(api.bulkEdit).toHaveBeenCalledWith({ ids: [1, 2, 3], favorite: true }));
    expect(await screen.findByText('Added 3 images to Favorites')).toBeInTheDocument();
  });

  it('Select puts taps into selection mode; Esc leaves it', async () => {
    renderGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByText('Tap images to select')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Image 2' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(screen.queryByRole('toolbar', { name: 'Selected images' })).toBeNull();
  });

  it('long-press selects on touch screens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    const first = await screen.findByRole('button', { name: 'Open image 1' });
    fireEvent.pointerDown(first, { button: 0 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(first);
    fireEvent.click(first);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
