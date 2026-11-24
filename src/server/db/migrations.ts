/**
 * Ordered schema migrations. They live in TypeScript (not .sql files) so they survive bundling.
 * Never edit a shipped migration: add a new one.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: `
      CREATE TABLE rounds (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        year        INTEGER NOT NULL,
        date        TEXT    NOT NULL,
        status      TEXT    NOT NULL CHECK (status IN ('open', 'revealed')) DEFAULT 'open',
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        revealed_at TEXT
      );

      CREATE TABLE items (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        title         TEXT    NOT NULL,
        description   TEXT    NOT NULL DEFAULT '',
        url           TEXT,
        price_minor   INTEGER,
        currency      TEXT,
        image_file    TEXT,
        priority      TEXT    NOT NULL CHECK (priority IN ('must', 'want', 'nice')) DEFAULT 'want',
        note          TEXT    NOT NULL DEFAULT '',
        status        TEXT    NOT NULL CHECK (status IN ('draft', 'published', 'received', 'archived')) DEFAULT 'published',
        group_funding INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE claims (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id      INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
        user_id      INTEGER NOT NULL,
        user_name    TEXT    NOT NULL,
        kind         TEXT    NOT NULL CHECK (kind IN ('full', 'share')),
        amount_minor INTEGER,
        created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (item_id, round_id, user_id)
      );
      CREATE UNIQUE INDEX claims_one_full_per_item ON claims(item_id, round_id) WHERE kind = 'full';
      CREATE INDEX claims_by_round ON claims(round_id, item_id);

      CREATE TABLE rates (
        base         TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        fetched_at   TEXT NOT NULL
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'open_round_unique',
    sql: `CREATE UNIQUE INDEX rounds_one_open ON rounds(status) WHERE status = 'open';`,
  },
  {
    version: 3,
    name: 'claim_lang',
    sql: `ALTER TABLE claims ADD COLUMN lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('ru', 'en'));`,
  },
  {
    version: 4,
    name: 'item_categories',
    sql: `
      ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT '';
      -- Older notes were stored as "Категория: X" in the description. The first line becomes the category
      -- (at most 100 characters, as the API allows); whatever follows stays as the description.
      UPDATE items
      SET category = substr(trim(CASE WHEN instr(substr(description, 12), char(10)) > 0
                                      THEN substr(substr(description, 12), 1, instr(substr(description, 12), char(10)) - 1)
                                      ELSE substr(description, 12) END, char(32, 13, 10)), 1, 100),
          description = CASE WHEN instr(substr(description, 12), char(10)) > 0
                             THEN trim(substr(substr(description, 12), instr(substr(description, 12), char(10)) + 1), char(32, 13, 10))
                             ELSE '' END
      WHERE description LIKE 'Категория: %';
    `,
  },
];
