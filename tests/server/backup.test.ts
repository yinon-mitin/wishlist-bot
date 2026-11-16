import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { createBot } from '../../src/server/bot/bot';
import { createBackup, pruneBackups, runBackup } from '../../src/server/services/backup';
import { createTestApp, OWNER_ID } from '../helpers/testApp';

const NOW = new Date('2027-01-10T03:00:05Z');
const dir = () => mkdtempSync(join(tmpdir(), 'wishlist-backup-'));

function seeded() {
  const t = createTestApp();
  const round = (t.db.prepare("SELECT id FROM rounds WHERE status='open'").get() as { id: number }).id;
  for (let i = 0; i < 50; i++) t.db.prepare('INSERT INTO items(title) VALUES (?)').run(`item ${i}`);
  t.db.prepare("INSERT INTO claims(item_id, round_id, user_id, user_name, kind) VALUES (1, ?, 5, 'A', 'full')").run(round);
  return t;
}

describe('createBackup', () => {
  it('writes a consistent SQLite copy with the same rows', () => {
    const t = seeded();
    const file = createBackup(t.db, dir(), NOW);
    expect(file).toMatch(/wishlist-20270110-030005\.sqlite$/);
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('SELECT COUNT(*) c FROM items').get()).toEqual({ c: 50 });
    expect(copy.prepare('SELECT COUNT(*) c FROM claims').get()).toEqual({ c: 1 });
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    copy.close();
  });

  it('never overwrites an existing backup, even within the same second', () => {
    const t = seeded();
    const d = dir();
    const a = createBackup(t.db, d, NOW);
    const b = createBackup(t.db, d, NOW);
    expect(b).not.toBe(a);
    expect(readdirSync(d)).toHaveLength(2);
  });

  it('creates the directory when it is missing', () => {
    const t = seeded();
    const d = join(dir(), 'nested', 'backups');
    expect(existsSync(createBackup(t.db, d, NOW))).toBe(true);
  });
});

describe('pruneBackups', () => {
  it('keeps the newest N backups and leaves foreign files alone', () => {
    const d = dir();
    const names = ['20270101-030000', '20270102-030000', '20270103-030000', '20270104-030000', '20270105-030000'].map((s) => `wishlist-${s}.sqlite`);
    for (const n of names) writeFileSync(join(d, n), 'x');
    writeFileSync(join(d, 'notes.txt'), 'mine');
    const removed = pruneBackups(d, 2);
    expect(removed.sort()).toEqual(names.slice(0, 3).sort());
    expect(readdirSync(d).sort()).toEqual(['notes.txt', names[3], names[4]].sort());
  });

  it('does nothing when there are fewer than N', () => {
    const d = dir();
    writeFileSync(join(d, 'wishlist-20270101-030000.sqlite'), 'x');
    expect(pruneBackups(d, 7)).toEqual([]);
  });

  it('returns an empty list for a missing directory', () => {
    expect(pruneBackups(join(dir(), 'nope'), 3)).toEqual([]);
  });
});

describe('runBackup', () => {
  it('sends the new file to the owner and prunes old ones', async () => {
    const t = seeded();
    const ok = await runBackup(t.deps);
    expect(ok).toBe(true);
    expect(t.notifier.docs).toHaveLength(1);
    expect(t.notifier.docs[0]).toMatchObject({ userId: OWNER_ID });
    expect(t.notifier.docs[0]!.path).toContain(join(t.dataDir, 'backups'));
  });

  it('does not throw when delivery fails, and reports false', async () => {
    const t = seeded();
    t.notifier.failFor.add(OWNER_ID);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await runBackup(t.deps)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(readdirSync(join(t.dataDir, 'backups'))).toHaveLength(1); // the file is kept locally
  });
});

describe('/backup command', () => {
  const update = (userId: number) => ({
    update_id: 1,
    message: {
      message_id: 1, date: 0, chat: { id: userId, type: 'private' as const, first_name: 'X' },
      from: { id: userId, is_bot: false, first_name: 'X' },
      text: '/backup', entities: [{ type: 'bot_command' as const, offset: 0, length: 7 }],
    },
  });
  const bot = (backup: () => Promise<boolean>) => {
    const b = createBot(
      { botToken: '123456:T', publicUrl: 'https://x.example', ownerId: OWNER_ID },
      { botInfo: { id: 1, is_bot: true, first_name: 'W', username: 'w' } as never },
      { backup },
    );
    const sent: string[] = [];
    b.api.config.use((async (_p: unknown, method: string) => {
      sent.push(method);
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } };
    }) as never);
    return { b, sent };
  };

  it('runs the backup for the owner', async () => {
    const backup = vi.fn().mockResolvedValue(true);
    const { b } = bot(backup);
    await b.handleUpdate(update(OWNER_ID));
    expect(backup).toHaveBeenCalledOnce();
  });

  it('stays completely silent for anyone else', async () => {
    const backup = vi.fn().mockResolvedValue(true);
    const { b, sent } = bot(backup);
    await b.handleUpdate(update(31337));
    expect(backup).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('tells the owner when the backup failed', async () => {
    const { b, sent } = bot(async () => false);
    await b.handleUpdate(update(OWNER_ID));
    expect(sent).toContain('sendMessage');
  });
});
