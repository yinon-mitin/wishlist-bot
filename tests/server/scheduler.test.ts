import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from '../../src/server/services/scheduler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const make = (tz = 'UTC') => new Scheduler(() => new Date(), tz);

describe('Scheduler.every', () => {
  it('runs repeatedly and stops on stop()', async () => {
    vi.setSystemTime(new Date('2027-01-10T00:00:00Z'));
    const s = make();
    const fn = vi.fn();
    s.every(1000, fn);
    await vi.advanceTimersByTimeAsync(3500);
    expect(fn).toHaveBeenCalledTimes(3);
    s.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('survives a task that throws or rejects', async () => {
    vi.setSystemTime(new Date('2027-01-10T00:00:00Z'));
    const s = make();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    s.every(1000, fn);
    await vi.advanceTimersByTimeAsync(2500);
    expect(fn).toHaveBeenCalledTimes(2);
    s.stop();
    quiet.mockRestore();
  });
});

describe('Scheduler.dailyAt', () => {
  it('fires at 03:00 in the configured time zone, not UTC, and reschedules itself', async () => {
    vi.setSystemTime(new Date('2027-01-10T00:30:00Z')); // 02:30 in Jerusalem (UTC+2)
    const s = make('Asia/Jerusalem');
    const fn = vi.fn();
    s.dailyAt(3, fn);
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * 60_000); // 01:01Z == 03:01 local
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 3600_000);
    expect(fn).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it('waits for tomorrow when the hour has already passed today', async () => {
    vi.setSystemTime(new Date('2027-01-10T04:00:00Z'));
    const s = make('UTC');
    const fn = vi.fn();
    s.dailyAt(3, fn);
    await vi.advanceTimersByTimeAsync(22 * 3600_000);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * 3600_000);
    expect(fn).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it('stop() cancels a pending daily task', async () => {
    vi.setSystemTime(new Date('2027-01-10T00:00:00Z'));
    const s = make('UTC');
    const fn = vi.fn();
    s.dailyAt(3, fn);
    s.stop();
    await vi.advanceTimersByTimeAsync(48 * 3600_000);
    expect(fn).not.toHaveBeenCalled();
  });
});
