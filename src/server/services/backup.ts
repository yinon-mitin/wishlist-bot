import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/db';
import type { AppDeps } from '../deps';

const NAME = /^wishlist-\d{8}-\d{6}(-\d+)?\.sqlite$/;

export const backupsDir = (dataDir: string) => join(dataDir, 'backups');

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Consistent online snapshot of the database (VACUUM INTO runs in a single read transaction). Never overwrites. */
export function createBackup(db: Db, dir: string, now: Date): string {
  mkdirSync(dir, { recursive: true });
  const base = `wishlist-${stamp(now)}`;
  let target = join(dir, `${base}.sqlite`);
  for (let n = 1; existsSync(target); n++) target = join(dir, `${base}-${n}.sqlite`);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}

/** Deletes all but the newest `keep` backups (only files this module created). Returns the deleted names. */
export function pruneBackups(dir: string, keep: number): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => NAME.test(n));
  } catch {
    return [];
  }
  // The timestamp sorts lexically; a "-N" suffix (same second) sorts after the plain name, which is newer.
  names.sort((a, b) => a.replace('.sqlite', '').localeCompare(b.replace('.sqlite', '')));
  const doomed = names.slice(0, Math.max(0, names.length - keep));
  for (const n of doomed) unlinkSync(join(dir, n));
  return doomed;
}

/** Snapshot, prune, and send the file to the owner. Returns true when it was delivered. Never throws on delivery trouble. */
export async function runBackup(deps: Pick<AppDeps, 'db' | 'config' | 'clock' | 'notifier'>): Promise<boolean> {
  const { db, config, clock, notifier } = deps;
  const dir = backupsDir(config.dataDir);
  const now = clock();
  const file = createBackup(db, dir, now);
  pruneBackups(dir, config.backupKeep);
  const delivered = await notifier.sendDocument(config.ownerId, file, `Wishlist backup ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  if (!delivered) console.warn(`[backup] ${file} was written but could not be sent to the owner`);
  return delivered;
}
