import type { Db } from '../db/db';
import type { Config } from '../config';

export interface Round {
  id: number;
  year: number;
  date: string; // YYYY-MM-DD
  status: 'open' | 'revealed';
  revealedAt: string | null;
}

interface RoundRow {
  id: number;
  year: number;
  date: string;
  status: 'open' | 'revealed';
  revealed_at: string | null;
}

const toRound = (r: RoundRow): Round => ({ id: r.id, year: r.year, date: r.date, status: r.status, revealedAt: r.revealed_at });

/** Today's calendar date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function birthdayIn(year: number, birthday: string): string {
  const [m, d] = birthday.split('-').map(Number) as [number, number];
  const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The next occurrence of the birthday that is not earlier than today (in the time zone). */
export function nextBirthday(birthday: string, from: Date, timezone: string): string {
  const today = todayIn(from, timezone);
  const year = Number(today.slice(0, 4));
  const candidate = birthdayIn(year, birthday);
  return candidate >= today ? candidate : birthdayIn(year + 1, birthday);
}

/** Whole days from today (in the time zone) to the date. Negative when the date has passed. */
export function daysUntil(date: string, now: Date, timezone: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayIn(now, timezone)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function getOpenRound(db: Db): Round {
  const row = db.prepare("SELECT * FROM rounds WHERE status = 'open'").get() as RoundRow | undefined;
  if (!row) throw new Error('There is no open round');
  return toRound(row);
}

/** Returns the open round, creating one for the next birthday when none exists. */
export function ensureOpenRound(db: Db, config: Pick<Config, 'birthday' | 'timezone'>, now: Date): Round {
  const existing = db.prepare("SELECT * FROM rounds WHERE status = 'open'").get() as RoundRow | undefined;
  if (existing) return toRound(existing);
  const date = nextBirthday(config.birthday, now, config.timezone);
  const id = db.prepare("INSERT INTO rounds(year, date, status) VALUES (?, ?, 'open')").run(Number(date.slice(0, 4)), date).lastInsertRowid;
  return getOpenRoundById(db, Number(id));
}

function getOpenRoundById(db: Db, id: number): Round {
  return toRound(db.prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow);
}
