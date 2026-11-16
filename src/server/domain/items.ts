import type { Db } from '../db/db';
import type { ItemStatus, Priority } from '../../shared/types';
import type { ItemRow } from './types';

export interface ItemInput {
  title: string;
  description?: string;
  url?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  imageFile?: string | null;
  priority?: Priority;
  note?: string;
  groupFunding?: boolean;
  /** Only at creation; use publishItem() to go live. */
  status?: Extract<ItemStatus, 'draft' | 'published'>;
}

const COLUMNS: Record<keyof ItemInput, string> = {
  title: 'title',
  description: 'description',
  url: 'url',
  priceMinor: 'price_minor',
  currency: 'currency',
  imageFile: 'image_file',
  priority: 'priority',
  note: 'note',
  status: 'status',
  groupFunding: 'group_funding',
};

export function getItem(db: Db, id: number): ItemRow | null {
  return (db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined) ?? null;
}

export function createItem(db: Db, input: ItemInput, now: Date): ItemRow {
  const ts = now.toISOString();
  const id = db
    .prepare('INSERT INTO items(title, description, url, price_minor, currency, image_file, priority, note, status, group_funding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(input.title, input.description ?? '', input.url ?? null, input.priceMinor ?? null, input.currency ?? null, input.imageFile ?? null, input.priority ?? 'want', input.note ?? '', input.status ?? 'published', input.groupFunding ? 1 : 0, ts, ts).lastInsertRowid;
  return getItem(db, Number(id))!;
}

/** Updates only the keys present in the patch. Returns null when the item does not exist. */
export function updateItem(db: Db, id: number, patch: Partial<ItemInput>, now: Date): ItemRow | null {
  const existing = getItem(db, id);
  if (!existing) return null;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(COLUMNS) as (keyof ItemInput)[]) {
    if (key in patch && patch[key] !== undefined) {
      sets.push(`${COLUMNS[key]} = ?`);
      values.push(key === 'groupFunding' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  sets.push('updated_at = ?');
  values.push(now.toISOString(), id);
  db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getItem(db, id);
}

export function deleteItem(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
}

/** Display order: priority first (must, want, nice), newest first inside a group. Independent of any claim data. */
export const ITEM_ORDER = "CASE priority WHEN 'must' THEN 0 WHEN 'want' THEN 1 ELSE 2 END, created_at DESC, id DESC";

/** Makes a draft visible to guests. Idempotent. Returns null when the item does not exist. */
export function publishItem(db: Db, id: number, now: Date): ItemRow | null {
  const existing = getItem(db, id);
  if (!existing) return null;
  if (existing.status === 'published') return existing;
  if (existing.status !== 'draft') return existing;
  db.prepare("UPDATE items SET status = 'published', updated_at = ? WHERE id = ?").run(now.toISOString(), id);
  return getItem(db, id);
}
