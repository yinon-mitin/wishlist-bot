import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/db';
import { migrate } from '../../src/server/db/migrate';
import { daysUntil, ensureOpenRound, getOpenRound, nextBirthday } from '../../src/server/domain/rounds';

const cfg = { birthday: '03-14', timezone: 'UTC' };
const fresh = () => {
  const db = openDb(':memory:');
  migrate(db);
  return db;
};

describe('nextBirthday', () => {
  it('is today on the birthday', () => {
    expect(nextBirthday('03-14', new Date('2027-03-14T10:00:00Z'), 'UTC')).toBe('2027-03-14');
    expect(daysUntil('2027-03-14', new Date('2027-03-14T10:00:00Z'), 'UTC')).toBe(0);
  });
  it('rolls to next year the day after', () => {
    expect(nextBirthday('03-14', new Date('2027-03-15T00:00:00Z'), 'UTC')).toBe('2028-03-14');
  });
  it('uses 28 February for 02-29 in a non-leap year and 29 in a leap year', () => {
    expect(nextBirthday('02-29', new Date('2027-01-10T00:00:00Z'), 'UTC')).toBe('2027-02-28');
    expect(nextBirthday('02-29', new Date('2027-12-01T00:00:00Z'), 'UTC')).toBe('2028-02-29');
  });
  it('changes day at local midnight, not UTC midnight', () => {
    const instant = new Date('2027-03-13T22:30:00Z'); // 00:30 on 14 March in Jerusalem
    expect(daysUntil(nextBirthday('03-14', instant, 'UTC'), instant, 'UTC')).toBe(1);
    expect(nextBirthday('03-14', instant, 'Asia/Jerusalem')).toBe('2027-03-14');
    expect(daysUntil('2027-03-14', instant, 'Asia/Jerusalem')).toBe(0);
  });
  it('counts days across a month boundary', () => {
    expect(daysUntil('2027-03-14', new Date('2027-02-28T12:00:00Z'), 'UTC')).toBe(14);
  });
});

describe('open round', () => {
  it('ensureOpenRound creates a round for the next birthday and is idempotent', () => {
    const db = fresh();
    const now = new Date('2027-01-10T12:00:00Z');
    const r1 = ensureOpenRound(db, cfg, now);
    const r2 = ensureOpenRound(db, cfg, now);
    expect(r1).toMatchObject({ year: 2027, date: '2027-03-14', status: 'open', revealedAt: null });
    expect(r2.id).toBe(r1.id);
    expect(getOpenRound(db).id).toBe(r1.id);
    expect((db.prepare('SELECT COUNT(*) c FROM rounds').get() as { c: number }).c).toBe(1);
  });
  it('the database refuses a second open round', () => {
    const db = fresh();
    ensureOpenRound(db, cfg, new Date('2027-01-10T12:00:00Z'));
    expect(() => db.prepare("INSERT INTO rounds(year, date, status) VALUES (2028, '2028-03-14', 'open')").run()).toThrowError(/UNIQUE/);
  });
  it('getOpenRound throws when there is none', () => {
    expect(() => getOpenRound(fresh())).toThrowError(/open round/);
  });
});
