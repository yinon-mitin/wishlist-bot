import type { Db } from '../db/db';
import { HttpError } from '../deps';
import type { Viewer } from '../../shared/types';
import { getItem } from './items';
import { getOpenRound } from './rounds';
import type { ClaimRow } from './types';

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && String((e as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT');
}

/** Reserves a whole item for the viewer. Idempotent for the same guest; one winner among many. */
export function claimFull(db: Db, itemId: number, viewer: Viewer, now: Date): ClaimRow {
  if (viewer.isOwner) throw new HttpError(403, 'owner_cannot_claim');
  const run = db.transaction((): ClaimRow => {
    const item = getItem(db, itemId);
    if (!item || item.status !== 'published') throw new HttpError(404, 'not_found');
    const round = getOpenRound(db);
    const existing = db.prepare('SELECT * FROM claims WHERE item_id = ? AND round_id = ?').all(itemId, round.id) as ClaimRow[];
    const mine = existing.find((c) => c.user_id === viewer.id && c.kind === 'full');
    if (mine) return mine;
    if (existing.length > 0) throw new HttpError(409, 'already_claimed');
    const id = db
      .prepare("INSERT INTO claims(item_id, round_id, user_id, user_name, kind, amount_minor, lang, created_at) VALUES (?, ?, ?, ?, 'full', NULL, ?, ?)")
      .run(itemId, round.id, viewer.id, viewer.name, viewer.lang, now.toISOString()).lastInsertRowid;
    return db.prepare('SELECT * FROM claims WHERE id = ?').get(Number(id)) as ClaimRow;
  });
  try {
    return run.immediate();
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, 'already_claimed');
    throw e;
  }
}

/** Releases the viewer's own reservation. Someone else's reservation is untouchable. */
export function releaseClaim(db: Db, itemId: number, viewer: Viewer): void {
  if (viewer.isOwner) throw new HttpError(403, 'owner_cannot_claim');
  db.transaction(() => {
    const round = getOpenRound(db);
    const rows = db.prepare('SELECT * FROM claims WHERE item_id = ? AND round_id = ?').all(itemId, round.id) as ClaimRow[];
    if (rows.length === 0) return;
    const mine = rows.filter((c) => c.user_id === viewer.id);
    if (mine.length === 0) throw new HttpError(403, 'forbidden');
    db.prepare('DELETE FROM claims WHERE item_id = ? AND round_id = ? AND user_id = ?').run(itemId, round.id, viewer.id);
  }).immediate();
}
