import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/db';
import { migrate } from '../../src/server/db/migrate';

function fresh() {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

function seedItem(db: ReturnType<typeof fresh>) {
  const round = db.prepare("INSERT INTO rounds(year, date, status) VALUES (2027, '2027-03-14', 'open')").run().lastInsertRowid;
  const item = db.prepare("INSERT INTO items(title) VALUES ('Book')").run().lastInsertRowid;
  return { round: Number(round), item: Number(item) };
}

const claim = (db: ReturnType<typeof fresh>, itemId: number, roundId: number, userId: number, kind = 'full') =>
  db.prepare("INSERT INTO claims(item_id, round_id, user_id, user_name, kind) VALUES (?, ?, ?, 'n', ?)").run(itemId, roundId, userId, kind);

describe('migrations', () => {
  it('creates the core tables', () => {
    const db = fresh();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['rounds', 'items', 'claims', 'rates', 'settings']) expect(names).toContain(t);
  });

  it('is idempotent and returns the same version', () => {
    const db = fresh();
    const v1 = migrate(db);
    const v2 = migrate(db);
    expect(v2).toBe(v1);
    expect(v1).toBeGreaterThanOrEqual(1);
  });

  it('enforces foreign keys on claims.item_id', () => {
    const db = fresh();
    const { round } = seedItem(db);
    expect(() => claim(db, 9999, round, 1)).toThrowError(/FOREIGN KEY/);
  });

  it('does not allow a second full claim on one item in a round', () => {
    const db = fresh();
    const { round, item } = seedItem(db);
    claim(db, item, round, 1);
    expect(() => claim(db, item, round, 2)).toThrowError(/UNIQUE/);
  });

  it('does not allow one user two rows on the same item and round', () => {
    const db = fresh();
    const { round, item } = seedItem(db);
    claim(db, item, round, 1, 'share');
    expect(() => claim(db, item, round, 1, 'share')).toThrowError(/UNIQUE/);
  });

  it('allows several shares from different users', () => {
    const db = fresh();
    const { round, item } = seedItem(db);
    claim(db, item, round, 1, 'share');
    expect(() => claim(db, item, round, 2, 'share')).not.toThrow();
  });
});
