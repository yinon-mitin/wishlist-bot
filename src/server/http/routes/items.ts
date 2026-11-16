import { Hono } from 'hono';
import { z } from 'zod';
import { createItem, deleteItem, getItem, updateItem, type ItemInput } from '../../domain/items';
import { toItemDto } from '../../domain/views';
import type { ClaimRow } from '../../domain/types';
import { getOpenRound } from '../../domain/rounds';
import { messages } from '../../messages';
import { HttpError, type AppDeps, type AppEnv } from '../../deps';
import { requireOwner } from '../guards';

const httpUrl = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const p = new URL(u).protocol;
      return p === 'http:' || p === 'https:';
    } catch {
      return false;
    }
  }, 'must be an http(s) URL');

export function itemsRoutes(deps: AppDeps): Hono<AppEnv> {
  const { config, db, clock } = deps;
  const r = new Hono<AppEnv>();

  const currency = z.string().transform((c) => c.toUpperCase()).refine((c) => config.currencies.includes(c), 'unsupported currency');
  const fields = {
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    url: httpUrl.nullable(),
    priceMinor: z.number().int().positive().nullable(),
    currency: currency.nullable(),
  };
  const createSchema = z.object({ ...fields, description: fields.description.optional(), url: fields.url.optional(), priceMinor: fields.priceMinor.optional(), currency: fields.currency.optional() }).strict();
  const patchSchema = z.object(fields).partial().strict();

  async function parseBody<T>(c: { req: { json(): Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HttpError(400, 'invalid_body');
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, 'invalid_body');
    return parsed.data;
  }

  const priceAndCurrencyTogether = (price: number | null | undefined, cur: string | null | undefined) => {
    if ((price == null) !== (cur == null)) throw new HttpError(400, 'invalid_body');
  };

  r.post('/items', requireOwner, async (c) => {
    const input = await parseBody(c, createSchema);
    priceAndCurrencyTogether(input.priceMinor, input.currency);
    const item = createItem(db, input as ItemInput, clock());
    return c.json(toItemDto(item, [], c.get('viewer'), config), 201);
  });

  r.patch('/items/:id', requireOwner, async (c) => {
    const id = Number(c.req.param('id'));
    const existing = Number.isInteger(id) ? getItem(db, id) : null;
    if (!existing) throw new HttpError(404, 'not_found');
    const patch = await parseBody(c, patchSchema);
    priceAndCurrencyTogether(
      'priceMinor' in patch ? patch.priceMinor : existing.price_minor,
      'currency' in patch ? patch.currency : existing.currency,
    );
    const item = updateItem(db, id, patch, clock())!;
    return c.json(toItemDto(item, [], c.get('viewer'), config));
  });

  r.delete('/items/:id', requireOwner, async (c) => {
    const id = Number(c.req.param('id'));
    const existing = Number.isInteger(id) ? getItem(db, id) : null;
    if (!existing) throw new HttpError(404, 'not_found');
    const claims = db
      .prepare('SELECT * FROM claims WHERE item_id = ? AND round_id = ?')
      .all(id, getOpenRound(db).id) as ClaimRow[];
    deleteItem(db, id);
    // Tell people whose reservation just vanished; delivery trouble never changes the answer.
    for (const claim of claims) {
      await deps.notifier.send(claim.user_id, messages.itemRemoved(claim.lang, existing.title)).catch(() => false);
    }
    return c.json({ ok: true });
  });

  return r;
}
