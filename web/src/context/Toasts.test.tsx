import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TOAST_MS, ToastProvider, useToasts } from './Toasts';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

function Trigger({ text, tone }: { text: string; tone?: 'info' | 'error' }) {
  const { show } = useToasts();
  return (
    <button type="button" onClick={() => show(text, tone)}>
      go
    </button>
  );
}

describe('ToastProvider', () => {
  it.each([
    { tone: undefined, text: 'Downloading sunset.png' },
    { tone: 'error' as const, text: 'Couldn’t load the original image.' },
  ])('shows "$text" and dismisses it after a few seconds', ({ tone, text }) => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger text={text} tone={tone} />
      </ToastProvider>,
    );
    act(() => screen.getByText('go').click());
    expect(screen.getByText(text)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByText(text)).toBeNull();
    vi.useRealTimers();
  });
});

function Boom(): never {
  throw new Error('corrupt preferences');
}

describe('ErrorBoundary', () => {
  it('replaces a crashed tree with a recoverable message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('corrupt preferences');
    screen.getByText('Reload').click();
    expect(onReset).toHaveBeenCalledOnce();
  });
});
