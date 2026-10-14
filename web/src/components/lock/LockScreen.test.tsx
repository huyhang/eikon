import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { LoginResult } from '../../api/client';
import { createFakeApi } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { LockScreen, secondsLeft } from './LockScreen';

const typeDigits = (digits: string) => {
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
};

describe('LockScreen', () => {
  it('submits the keypad passcode with "remember" and unlocks', async () => {
    const api = createFakeApi();
    const onUnlocked = vi.fn();
    renderWithProviders(<LockScreen numeric onUnlocked={onUnlocked} />, { api });

    typeDigits('1234');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(api.login).toHaveBeenCalledWith({ passcode: '1234', remember: true });
  });

  it.each<{ name: string; result: LoginResult; message: RegExp }>([
    { name: 'wrong passcode', result: { ok: false, error: 'Wrong passcode' }, message: /wrong passcode/i },
    {
      name: 'throttled',
      result: { ok: false, error: 'Too many', retryAfterSeconds: 30 },
      message: /try again in 30s/i,
    },
  ])('shows an error for $name and clears the entry', async ({ result, message }) => {
    const api = createFakeApi({ login: vi.fn(async () => result) });
    const onUnlocked = vi.fn();
    renderWithProviders(<LockScreen numeric onUnlocked={onUnlocked} />, { api, now: () => 1_000_000 });

    typeDigits('99');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: /0 digits/ })).toBeInTheDocument();
  });

  it('uses a text field for non-numeric passcodes', async () => {
    const api = createFakeApi();
    renderWithProviders(<LockScreen numeric={false} onUnlocked={() => {}} />, { api });

    fireEvent.change(screen.getByLabelText('Passcode'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Remember this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ passcode: 'hunter2', remember: false }));
  });
});

describe('secondsLeft', () => {
  it.each([
    { until: null, now: 0, expected: 0 },
    { until: 10_000, now: 0, expected: 10 },
    { until: 10_000, now: 9_100, expected: 1 },
    { until: 10_000, now: 20_000, expected: 0 },
  ])('until=$until now=$now → $expected', ({ until, now, expected }) => {
    expect(secondsLeft(until, now)).toBe(expected);
  });
});
