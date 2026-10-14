import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { AppRoutes } from '../App';
import { createFakeApi, fakeAuthStatus, sampleDetail, sampleTagInfo, sampleTile } from '../test/fakeApi';
import { renderWithProviders } from '../test/render';
import { DuplicatesPage } from './DuplicatesPage';
import { reviewKeyAction, ReviewPage } from './ReviewPage';
import { SettingsPage } from './SettingsPage';
import { TagsPage } from './TagsPage';

const at = (path: string, element: React.ReactElement, api = createFakeApi(), confirm = () => true) =>
  renderWithProviders(
    <Routes>
      <Route path={path} element={element} />
    </Routes>,
    { api, route: path, confirm },
  );

describe('reviewKeyAction', () => {
  it.each([
    ['Enter', 'confirm'],
    ['ArrowRight', 'confirm'],
    ['s', 'skip'],
    ['ArrowDown', 'skip'],
    ['x', null],
  ])('%s → %s', (key, expected) => {
    expect(reviewKeyAction(key)).toBe(expected);
  });
});

const queue = (ids: number[]) => ({ total: ids.length, images: ids.map((id) => sampleDetail({ id })) });

describe('ReviewPage', () => {
  it('confirms the current image and skips to the next', async () => {
    const api = createFakeApi({ reviewQueue: vi.fn(async () => queue([1, 2])) });
    at('/review', <ReviewPage />, api);
    expect(await screen.findByText('2 images to review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }));
    await waitFor(() => expect(api.markReviewed).toHaveBeenCalledWith(1));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('1 image to review')).toBeInTheDocument();
  });

  it.each([
    { label: 'confirmed', confirmed: true, calls: 1 },
    { label: 'cancelled', confirmed: false, calls: 0 },
  ])('marks the whole backlog reviewed only when $label', async ({ confirmed, calls }) => {
    const api = createFakeApi({ reviewQueue: vi.fn(async () => queue([1, 2, 3])) });
    at('/review', <ReviewPage />, api, () => confirmed);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all reviewed' }));
    await waitFor(() => expect(api.markAllReviewed).toHaveBeenCalledTimes(calls));
  });

  it('says when nothing is left', async () => {
    at('/review', <ReviewPage />);
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
  });
});

describe('DuplicatesPage', () => {
  it('lists clusters and toggles hiding of smaller copies', async () => {
    const api = createFakeApi({
      duplicates: vi.fn(async () => [
        {
          best: sampleTile(1, { width: 3000, height: 2000 }),
          copies: [sampleTile(2, { width: 600, height: 400 })],
        },
      ]),
    });
    at('/duplicates', <DuplicatesPage />, api);
    expect(await screen.findByText(/Best copy 3000 × 2000 · 600 × 400/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('switch', { name: 'Hide smaller copies in grids' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ hideDuplicates: false }));
  });
});

describe('TagsPage', () => {
  it('opens a tag and renames it', async () => {
    const api = createFakeApi({
      manageTags: vi.fn(async () => ({
        total: 1,
        tags: [sampleTagInfo({ name: 'kitten', aliases: ['neko'] })],
      })),
      tagInfo: vi.fn(async (name: string) => sampleTagInfo({ name })),
    });
    at('/tags', <TagsPage />, api);
    fireEvent.click(await screen.findByText('aka neko'));
    const input = await screen.findByRole('textbox', { name: 'Tag name' });
    fireEvent.change(input, { target: { value: 'cat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(api.updateTag).toHaveBeenCalledWith('kitten', { name: 'cat' }));
  });
});

describe('SettingsPage additions', () => {
  it('lists backups with download links and can back up now', async () => {
    const api = createFakeApi({
      backups: vi.fn(async () => [
        { name: 'eikon-20261014-030000.db', sizeBytes: 2048, createdAt: Date.now() - 60_000 },
      ]),
    });
    at('/settings', <SettingsPage />, api);
    expect(await screen.findByText('Last backup 1 min ago')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2\.0 KB/ })).toHaveAttribute(
      'href',
      '/api/backups/eikon-20261014-030000.db',
    );
    expect(screen.getByRole('link', { name: /Export curation/ })).toHaveAttribute('href', '/api/export');
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(api.createBackup).toHaveBeenCalled());
  });

  it.each([
    {
      label: 'passcode session: sign out everywhere after confirming',
      auth: fakeAuthStatus({ required: true, passcode: true, method: 'session' }),
      expectText: 'Sign out all devices',
    },
    {
      label: 'tailnet identity: shows who is signed in',
      auth: fakeAuthStatus({ required: true, method: 'tailscale', user: { login: 'me@github', name: 'Me' } }),
      expectText: 'Signed in as',
    },
  ])('$label', async ({ auth, expectText }) => {
    // The whole app, so the auth gate loads the auth status the way it does in production.
    renderWithProviders(<AppRoutes />, {
      api: createFakeApi({ authStatus: vi.fn(async () => auth) }),
      route: '/settings',
    });
    expect(await screen.findByText(expectText)).toBeInTheDocument();
  });
});
