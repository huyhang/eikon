import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { createFakeApi } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { CommandPalette } from './CommandPalette';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPalette() {
  const api = createFakeApi({
    groups: vi.fn(async (kind: 'illustrator' | 'collection') =>
      kind === 'illustrator'
        ? [{ id: 7, kind, name: 'Aiko Sorano', imageCount: 31, covers: [], latestAt: 0 }]
        : [],
    ),
  });
  renderWithProviders(
    <Routes>
      <Route
        path="*"
        element={
          <>
            <CommandPalette />
            <Where />
          </>
        }
      />
    </Routes>,
    { api },
  );
}

const pressCmdK = () =>
  act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })));

describe('CommandPalette', () => {
  it('opens with ⌘K and jumps to an illustrator', async () => {
    renderPalette();
    pressCmdK();
    const input = screen.getByRole('textbox', { name: 'Jump to' });
    fireEvent.change(input, { target: { value: 'aik' } });
    expect(await screen.findByText('Aiko Sorano')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/illustrators/7');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    { label: 'Escape', close: (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Escape' }) },
    { label: '⌘K again', close: () => pressCmdK() },
  ])('closes with $label', ({ close }) => {
    renderPalette();
    pressCmdK();
    close(screen.getByRole('textbox', { name: 'Jump to' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers a describe search for free text', async () => {
    renderPalette();
    pressCmdK();
    fireEvent.change(screen.getByRole('textbox', { name: 'Jump to' }), { target: { value: 'stormy sea' } });
    fireEvent.click(await screen.findByText('Describe: “stormy sea”'));
    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=stormy+sea');
  });
});
