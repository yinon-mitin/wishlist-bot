import type { Db } from '../db/db';
import type { Config } from '../config';
import { HttpError, type AppDeps } from '../deps';
import type { ClaimDto, ItemDto, Viewer } from '../../shared/types';
import { messages } from '../messages';
import { ITEM_ORDER } from './items';
import { getOpenRound, nextBirthday, todayIn, type Round } from './rounds';
import type { ClaimRow, ItemRow } from './types';
import { toItemDto } from './views';

interface RoundRow {
  id: number;
  year: number;
  date: string;
  status: 'open' | 'revealed';
  revealed_at: string | null;
}

export function getRound(db: Db, id: number): Round | null {
  const r = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow | undefined;
  return r ? { id: r.id, year: r.year, date: r.date, status: r.status, revealedAt: r.revealed_at } : null;
}

const ownerViewer = (config: Pick<Config, 'ownerId'>): Viewer => ({ id: config.ownerId, name: '', lang: 'en', isOwner: true });

function assertBirthdayReached(round: Round, config: Pick<Config, 'timezone'>, now: Date) {
  if (todayIn(now, config.timezone) < round.date) throw new HttpError(409, 'too_early');
}

export interface RevealEntry {
  item: ItemDto;
  claims: ClaimDto[];
}

/**
 * The only place the owner may see who reserved what: on or after the birthday (open round),
 * or at any time for a round that was already closed.
 */
export function previewReveal(db: Db, config: Config, now: Date, roundId?: number): { round: Round; items: RevealEntry[] } {
  const round = roundId === undefined ? getOpenRound(db) : getRound(db, roundId);
  if (!round) throw new HttpError(404, 'not_found');
  if (round.status === 'open') assertBirthdayReached(round, config, now);

  const claims = db.prepare('SELECT * FROM claims WHERE round_id = ? ORDER BY id').all(round.id) as ClaimRow[];
  const ids = [...new Set(claims.map((c) => c.item_id))];
  if (ids.length === 0) return { round, items: [] };
  const rows = db.prepare(`SELECT * FROM items WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY ${ITEM_ORDER}`).all(...ids) as ItemRow[];
  const viewer = ownerViewer(config);
  return {
    round,
    items: rows.map((row) => ({
      item: toItemDto(row, [], viewer, config),
      claims: claims
        .filter((c) => c.item_id === row.id)
        .map((c): ClaimDto => ({ userId: c.user_id, name: c.user_name, kind: c.kind, amountMinor: c.amount_minor, mine: false })),
    })),
  };
}

/**
 * Closes an open round once the birthday has come: chosen gifts become "received", the round is marked
 * revealed, the next birthday's round opens, and the givers of received gifts are thanked.
 * Everything that changes data happens in one transaction; notifications go out after it commits.
 */
export async function closeRound(
  deps: Pick<AppDeps, 'db' | 'config' | 'clock' | 'notifier'>,
  roundId: number,
  receivedItemIds: number[],
): Promise<{ nextRound: Round; thanked: number }> {
  const { db, config, notifier } = deps;
  const now = deps.clock();
  const round = getRound(db, roundId);
  if (!round) throw new HttpError(404, 'not_found');
  if (round.status !== 'open') throw new HttpError(409, 'already_closed');
  assertBirthdayReached(round, config, now);

  const received = [...new Set(receivedItemIds)];
  const { nextRound, thankYous } = db
    .transaction(() => {
      const fresh = getRound(db, roundId);
      if (!fresh || fresh.status !== 'open') throw new HttpError(409, 'already_closed');
      const claims = db.prepare('SELECT * FROM claims WHERE round_id = ?').all(roundId) as ClaimRow[];
      const claimed = new Set(claims.map((c) => c.item_id));
      if (received.some((id) => !claimed.has(id))) throw new HttpError(400, 'invalid_received');

      const ts = now.toISOString();
      const titles = new Map<number, string>();
      for (const id of received) {
        db.prepare("UPDATE items SET status = 'received', updated_at = ? WHERE id = ?").run(ts, id);
        titles.set(id, (db.prepare('SELECT title FROM items WHERE id = ?').get(id) as { title: string }).title);
      }
      db.prepare("UPDATE rounds SET status = 'revealed', revealed_at = ? WHERE id = ?").run(ts, roundId);

      const from = new Date(Math.max(Date.parse(`${fresh.date}T12:00:00Z`) + 86_400_000, now.getTime()));
      const date = nextBirthday(config.birthday, from, config.timezone);
      const id = db.prepare("INSERT INTO rounds(year, date, status) VALUES (?, ?, 'open')").run(Number(date.slice(0, 4)), date).lastInsertRowid;

      const byGiver = new Map<number, { lang: ClaimRow['lang']; titles: string[] }>();
      for (const c of claims) {
        const title = titles.get(c.item_id);
        if (title === undefined) continue;
        const entry = byGiver.get(c.user_id) ?? { lang: c.lang, titles: [] };
        if (!entry.titles.includes(title)) entry.titles.push(title);
        byGiver.set(c.user_id, entry);
      }
      return { nextRound: getRound(db, Number(id))!, thankYous: [...byGiver.entries()] };
    })
    .immediate();

  let thanked = 0;
  for (const [userId, { lang, titles }] of thankYous) {
    if (await notifier.send(userId, messages.thanks(lang, titles)).catch(() => false)) thanked++;
  }
  return { nextRound, thanked };
}
