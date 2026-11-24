import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/db';
import { migrate } from '../../src/server/db/migrate';
import { MIGRATIONS } from '../../src/server/db/migrations';

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

/** A database as it was before `version`: older migrations applied, newer ones pending. */
function dbBefore(version: number) {
  const db = openDb(':memory:');
  db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  for (const m of MIGRATIONS.filter((x) => x.version < version)) {
    db.exec(m.sql);
    db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, 'x')").run(m.version, m.name);
  }
  return db;
}

describe('migration 4: item categories', () => {
  const legacy = (db: ReturnType<typeof dbBefore>, title: string, description: string) =>
    db.prepare('INSERT INTO items(title, description) VALUES (?, ?)').run(title, description);
  const read = (db: ReturnType<typeof dbBefore>, title: string) =>
    db.prepare('SELECT description, category FROM items WHERE title = ?').get(title) as { description: string; category: string };

  it('moves a "Категория: X" description into the category column', () => {
    const db = dbBefore(4);
    legacy(db, 'a', 'Категория: Растения и сад');
    migrate(db);
    expect(read(db, 'a')).toEqual({ description: '', category: 'Растения и сад' });
  });

  it('takes only the first line as the category and keeps the rest as the description', () => {
    const db = dbBefore(4);
    legacy(db, 'a', 'Категория: Дом\nВторая строка');
    migrate(db);
    expect(read(db, 'a')).toEqual({ description: 'Вторая строка', category: 'Дом' });
  });

  it('never stores a category longer than the API allows', () => {
    const db = dbBefore(4);
    legacy(db, 'a', `Категория: ${'x'.repeat(300)}`);
    migrate(db);
    expect(read(db, 'a').category).toHaveLength(100);
  });

  it('leaves ordinary descriptions alone and defaults the category to empty', () => {
    const db = dbBefore(4);
    legacy(db, 'a', 'Обычное описание');
    migrate(db);
    expect(read(db, 'a')).toEqual({ description: 'Обычное описание', category: '' });
  });
});

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
