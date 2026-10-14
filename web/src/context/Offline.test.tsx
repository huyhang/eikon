import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useToggleFavorite } from '../api/hooks';
import { AppRoutes } from '../App';
import { AppShell } from '../components/layout/AppShell';
import { SettingsPage } from '../pages/SettingsPage';
import { NO_OFFLINE } from '../offline/offlineService';
import { createFakeApi, fakeAuthStatus } from '../test/fakeApi';
import { createFakeOffline } from '../test/fakeOffline';
import { renderWithProviders } from '../test/render';
import { EDIT_SYNC_DELAY_MS, useOfflineAutoSync } from './Offline';

afterEach(() => vi.useRealTimers());

const toggle = () => screen.getByRole('switch', { name: 'Keep favorites available offline' });

/** The part of the app shell that decides when to sync. */
function ShellEffects() {
  useOfflineAutoSync();
  return null;
}

/** Stands in for any edit. */
function FavoriteButton() {
  const favorite = useToggleFavorite(7);
  return (
    <button type="button" onClick={() => favorite.mutate(true)}>
      favorite 7
    </button>
  );
}

describe('offline favorites', () => {
  it('switching on saves favorites and says how many', async () => {
    const offline = createFakeOffline();
    renderWithProviders(
      <>
        <ShellEffects />
        <SettingsPage />
      </>,
      { offline },
    );
    expect(offline.sync).not.toHaveBeenCalled();
    fireEvent.click(toggle());
    expect(await screen.findByText('3 favorites saved · 4.8 MB on this device')).toBeInTheDocument();
    expect(offline.enable).toHaveBeenCalled();
    // The exact list the Favorites page asks for, so it opens offline.
    expect(offline.sync).toHaveBeenCalledWith('/api/images?favorites=1&sort=newest', expect.anything());
  });

  it('switching off removes everything saved', async () => {
    const offline = createFakeOffline();
    renderWithProviders(
      <>
        <ShellEffects />
        <SettingsPage />
      </>,
      { offline },
    );
    fireEvent.click(toggle());
    await screen.findByText(/favorites saved/);
    offline.disable.mockClear();
    fireEvent.click(toggle());
    await waitFor(() => expect(offline.disable).toHaveBeenCalled());
    expect(screen.queryByText(/favorites saved/)).toBeNull();
  });

  it('follows edits a few seconds later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const offline = createFakeOffline();
    const { api } = renderWithProviders(
      <>
        <ShellEffects />
        <SettingsPage />
        <FavoriteButton />
      </>,
      { offline },
    );
    fireEvent.click(toggle());
    await screen.findByText(/favorites saved/);
    offline.sync.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'favorite 7' }));
    await waitFor(() => expect(api.setFavorite).toHaveBeenCalled());
    expect(offline.sync).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(EDIT_SYNC_DELAY_MS));
    expect(offline.sync).toHaveBeenCalledTimes(1);
  });

  it('explains when offline saving is not possible here', () => {
    renderWithProviders(<SettingsPage />, { offline: NO_OFFLINE });
    expect(screen.getByText(/Needs Eikon opened over HTTPS/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Keep favorites available offline' })).toBeNull();
  });

  it('signing out removes what was saved', async () => {
    const offline = createFakeOffline();
    const api = createFakeApi({
      authStatus: vi.fn(async () =>
        fakeAuthStatus({ required: true, authenticated: true, passcode: true, method: 'session' }),
      ),
    });
    renderWithProviders(<AppRoutes />, { offline, api, route: '/settings' });
    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    await waitFor(() => expect(offline.disable).toHaveBeenCalled()); // start-up tidy-up while off
    offline.disable.mockClear();
    fireEvent.click(signOut);
    await waitFor(() => expect(api.logout).toHaveBeenCalled());
    await waitFor(() => expect(offline.disable).toHaveBeenCalled());
  });

  it('the shell says when the connection is gone', async () => {
    renderWithProviders(<AppShell />, { offline: createFakeOffline() });
    expect(screen.queryByText('Offline')).toBeNull();
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(await screen.findByText('Offline')).toBeInTheDocument();
    onLine.mockRestore();
  });
});
