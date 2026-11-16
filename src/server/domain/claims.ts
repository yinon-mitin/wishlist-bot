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
    const mine = rows.filter((c) => c.user_id === viewer.id && c.kind === 'full');
    if (mine.length === 0) throw new HttpError(403, 'forbidden');
    db.prepare("DELETE FROM claims WHERE item_id = ? AND round_id = ? AND user_id = ? AND kind = 'full'").run(itemId, round.id, viewer.id);
  }).immediate();
}

/** All claims of a round, grouped by item. */
export function claimsByItem(db: Db, roundId: number): Map<number, ClaimRow[]> {
  const rows = db.prepare('SELECT * FROM claims WHERE round_id = ? ORDER BY id').all(roundId) as ClaimRow[];
  const map = new Map<number, ClaimRow[]>();
  for (const row of rows) {
    const list = map.get(row.item_id);
    if (list) list.push(row);
    else map.set(row.item_id, [row]);
  }
  return map;
}

export function raisedFor(db: Db, itemId: number, roundId: number): number {
  const row = db.prepare("SELECT COALESCE(SUM(amount_minor), 0) AS s FROM claims WHERE item_id = ? AND round_id = ? AND kind = 'share'").get(itemId, roundId) as { s: number };
  return row.s;
}

/**
 * Adds or changes the viewer's share of a group-funded gift. The sum of all shares can never exceed the price;
 * the check and the write happen in one immediate transaction.
 */
export function contribute(db: Db, itemId: number, viewer: Viewer, amountMinor: number, now: Date): ClaimRow {
  if (viewer.isOwner) throw new HttpError(403, 'owner_cannot_claim');
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new HttpError(400, 'invalid_amount');
  return db
    .transaction((): ClaimRow => {
      const item = getItem(db, itemId);
      if (!item || item.status !== 'published') throw new HttpError(404, 'not_found');
      if (item.group_funding !== 1 || item.price_minor === null) throw new HttpError(409, 'not_group_item');
      const round = getOpenRound(db);
      const rows = db.prepare('SELECT * FROM claims WHERE item_id = ? AND round_id = ?').all(itemId, round.id) as ClaimRow[];
      if (rows.some((c) => c.kind === 'full')) throw new HttpError(409, 'already_claimed');
      const others = rows.filter((c) => c.user_id !== viewer.id).reduce((sum, c) => sum + (c.amount_minor ?? 0), 0);
      if (others + amountMinor > item.price_minor) throw new HttpError(409, 'over_funded');
      const mine = rows.find((c) => c.user_id === viewer.id);
      if (mine) {
        db.prepare('UPDATE claims SET amount_minor = ? WHERE id = ?').run(amountMinor, mine.id);
        return db.prepare('SELECT * FROM claims WHERE id = ?').get(mine.id) as ClaimRow;
      }
      const id = db
        .prepare("INSERT INTO claims(item_id, round_id, user_id, user_name, kind, amount_minor, lang, created_at) VALUES (?, ?, ?, ?, 'share', ?, ?, ?)")
        .run(itemId, round.id, viewer.id, viewer.name, amountMinor, viewer.lang, now.toISOString()).lastInsertRowid;
      return db.prepare('SELECT * FROM claims WHERE id = ?').get(Number(id)) as ClaimRow;
    })
    .immediate();
}

/** Removes the viewer's own share. Someone else's share is untouchable; nothing to remove is fine. */
export function withdrawContribution(db: Db, itemId: number, viewer: Viewer): void {
  if (viewer.isOwner) throw new HttpError(403, 'owner_cannot_claim');
  db.transaction(() => {
    const round = getOpenRound(db);
    const rows = db.prepare("SELECT * FROM claims WHERE item_id = ? AND round_id = ? AND kind = 'share'").all(itemId, round.id) as ClaimRow[];
    if (rows.length === 0) return;
    if (!rows.some((c) => c.user_id === viewer.id)) throw new HttpError(403, 'forbidden');
    db.prepare("DELETE FROM claims WHERE item_id = ? AND round_id = ? AND user_id = ? AND kind = 'share'").run(itemId, round.id, viewer.id);
  }).immediate();
}

/** Deletes every share of an item in the open round and returns the removed rows (so the people can be told). */
export function releaseShares(db: Db, itemId: number): ClaimRow[] {
  const round = getOpenRound(db);
  return db.transaction(() => {
    const rows = db.prepare("SELECT * FROM claims WHERE item_id = ? AND round_id = ? AND kind = 'share'").all(itemId, round.id) as ClaimRow[];
    db.prepare("DELETE FROM claims WHERE item_id = ? AND round_id = ? AND kind = 'share'").run(itemId, round.id);
    return rows;
  }).immediate();
}
