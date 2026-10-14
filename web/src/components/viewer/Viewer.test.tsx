import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { createFakeApi, sampleTile } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { ImageCollection } from '../grid/ImageCollection';

const tiles = [sampleTile(1), sampleTile(2), sampleTile(3)];

// jsdom does no layout; give elements a width so the justified grid lays out a row of tiles.
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 }),
);
afterAll(
  () => widthDescriptor && Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor),
);
afterEach(() => vi.unstubAllGlobals());

/** Pretends the window is wide (a desktop or a landscape iPad) or narrow (a phone). */
function stubScreen(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query.includes('min-width'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** Stands in for the browser's Back button. */
function Back() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Back
    </button>
  );
}

async function openViewer(wide: boolean) {
  stubScreen(wide);
  renderWithProviders(
    <>
      <Back />
      <ImageCollection tiles={tiles} contextKey="grid" primary />
    </>,
    { api: createFakeApi() },
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Open image 1' }));
  return screen.findByRole('dialog', { name: 'Image viewer' });
}

const press = (key: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key })));

describe('Viewer', () => {
  it('Slideshow takes over the screen and hands back at the picture it reached', async () => {
    await openViewer(false);
    fireEvent.click(screen.getByRole('button', { name: 'Slideshow' }));
    expect(await screen.findByRole('dialog', { name: 'Slideshow' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Image viewer' })).toBeNull();
    press('ArrowRight');
    press('Escape');
    expect(await screen.findByRole('dialog', { name: 'Image viewer' })).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('Back during a slideshow closes it along with the viewer', async () => {
    await openViewer(false);
    fireEvent.click(screen.getByRole('button', { name: 'Slideshow' }));
    await screen.findByRole('dialog', { name: 'Slideshow' });
    fireEvent.click(screen.getByRole('button', { name: 'Back', hidden: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Slideshow' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open image 3', hidden: true }));
    expect(await screen.findByRole('dialog', { name: 'Image viewer' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Slideshow' })).toBeNull();
  });

  it.each([
    { wide: true, filmstrip: true, split: true },
    { wide: false, filmstrip: false, split: false },
  ])('wide=$wide: filmstrip $filmstrip, split toggle $split', async ({ wide, filmstrip, split }) => {
    await openViewer(wide);
    expect(screen.queryByRole('navigation', { name: 'Nearby images' }) !== null).toBe(filmstrip);
    expect(screen.queryByRole('button', { name: 'Show the grid beside the viewer' }) !== null).toBe(split);
  });

  it('filmstrip taps jump straight to a picture', async () => {
    await openViewer(true);
    const strip = screen.getByRole('navigation', { name: 'Nearby images' });
    fireEvent.click(within(strip).getByRole('button', { name: 'Image 3' }));
    expect(await screen.findByText('3 of 3')).toBeInTheDocument();
  });

  it('split view keeps the grid usable beside the viewer', async () => {
    await openViewer(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show the grid beside the viewer' }));
    expect(screen.getByRole('dialog', { name: 'Image viewer' })).toHaveAttribute('aria-modal', 'false');
    expect(document.documentElement.dataset.viewerSplit).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Open image 2' }));
    expect(await screen.findByText('2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen viewer' }));
    expect(document.documentElement.dataset.viewerSplit).toBeUndefined();
  });
});
