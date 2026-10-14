import { describe, expect, it } from 'vitest';
import type { StatusResponse } from '@eikon/shared';
import { idleStatus } from '../../test/fakeApi';
import { ringProgress, ringState, type RingState } from './StatusRing';

const status = (
  scan: Partial<StatusResponse['scan']>,
  tagging: Partial<StatusResponse['tagging']>,
): StatusResponse => ({
  scan: { ...idleStatus.scan, ...scan },
  tagging: { ...idleStatus.tagging, ...tagging },
});

describe('ringState', () => {
  it.each<{ name: string; value: StatusResponse | undefined; expected: RingState }>([
    { name: 'no data', value: undefined, expected: 'hidden' },
    { name: 'idle', value: idleStatus, expected: 'hidden' },
    { name: 'scanning wins', value: status({ phase: 'processing' }, { pending: 5 }), expected: 'scanning' },
    { name: 'tagging', value: status({}, { pending: 5 }), expected: 'tagging' },
    { name: 'tagger offline', value: status({}, { pending: 5, taggerOnline: false }), expected: 'offline' },
    { name: 'failures only', value: status({}, { failed: 2 }), expected: 'failed' },
  ])('$name → $expected', ({ value, expected }) => {
    expect(ringState(value)).toBe(expected);
  });
});

describe('ringProgress', () => {
  it.each([
    { value: status({ phase: 'processing', processed: 25, total: 100 }, {}), expected: 0.25 },
    { value: status({ phase: 'walking', processed: 0, total: 0 }, {}), expected: 0 },
    { value: status({}, { done: 3, total: 4 }), expected: 0.75 },
    { value: status({}, { done: 0, total: 0 }), expected: 0 },
  ])('→ $expected', ({ value, expected }) => {
    expect(ringProgress(value)).toBe(expected);
  });
});
