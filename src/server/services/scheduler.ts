import type { Clock } from '../deps';

type Task = () => unknown | Promise<unknown>;

/** Minimal timer wrapper: repeating tasks and "every day at HH:00 in a time zone" tasks. Task errors are logged, never thrown. */
export class Scheduler {
  private handles = new Set<NodeJS.Timeout>();
  private stopped = false;

  constructor(
    private clock: Clock,
    private timezone: string,
  ) {}

  private async run(task: Task): Promise<void> {
    try {
      await task();
    } catch (err) {
      console.error('[scheduler] task failed:', err instanceof Error ? err.message : err);
    }
  }

  every(ms: number, task: Task): void {
    const h = setInterval(() => void this.run(task), ms);
    h.unref?.();
    this.handles.add(h);
  }

  /** Runs the task every day at `hour`:00 local time (re-evaluated after each run, so DST shifts self-correct). */
  dailyAt(hour: number, task: Task): void {
    const schedule = () => {
      if (this.stopped) return;
      const h = setTimeout(async () => {
        this.handles.delete(h);
        await this.run(task);
        schedule();
      }, this.msUntil(hour));
      h.unref?.();
      this.handles.add(h);
    };
    schedule();
  }

  stop(): void {
    this.stopped = true;
    for (const h of this.handles) {
      clearTimeout(h);
      clearInterval(h);
    }
    this.handles.clear();
  }

  private msUntil(hour: number): number {
    const now = this.clock();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: this.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const secondsOfDay = get('hour') * 3600 + get('minute') * 60 + get('second');
    let delta = hour * 3600 - secondsOfDay;
    if (delta <= 0) delta += 86400;
    return delta * 1000 - now.getMilliseconds();
  }
}
