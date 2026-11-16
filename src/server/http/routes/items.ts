import { Hono } from 'hono';
import { z } from 'zod';
import { claimFull, claimsByItem, contribute, raisedFor, releaseClaim, releaseShares, withdrawContribution } from '../../domain/claims';
import { ITEM_ORDER, createItem, deleteItem, getItem, publishItem, updateItem, type ItemInput } from '../../domain/items';
import { toItemDto } from '../../domain/views';
import type { ClaimRow, ItemRow } from '../../domain/types';
import { getOpenRound } from '../../domain/rounds';
import { messages } from '../../messages';
import { collectImage } from '../../services/images';
import { HttpError, type AppDeps, type AppEnv } from '../../deps';
import type { Viewer } from '../../../shared/types';
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
    priority: z.enum(['must', 'want', 'nice']),
    note: z.string().max(500),
    groupFunding: z.boolean(),
  };
  const status = z.enum(['draft', 'published']);
  const createSchema = z.object({ ...fields, description: fields.description.optional(), url: fields.url.optional(), priceMinor: fields.priceMinor.optional(), currency: fields.currency.optional(), priority: fields.priority.optional(), note: fields.note.optional(), status: status.optional(), groupFunding: fields.groupFunding.optional() }).strict();
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

  const parseId = (raw: string | undefined): number => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
    return id;
  };

  /** Items a viewer may see: guests only published ones; the owner also drafts. */
  const visible = (item: ItemRow | null, isOwner: boolean): item is ItemRow =>
    item !== null && (isOwner ? item.status === 'draft' || item.status === 'published' || item.status === 'received' : item.status === 'published');

  const dtoFor = (item: ItemRow, viewer: Viewer) => {
    const claims = viewer.isOwner ? [] : (claimsByItem(db, getOpenRound(db).id).get(item.id) ?? []);
    return toItemDto(item, claims, viewer, config);
  };

  r.get('/items', (c) => {
    const viewer = c.get('viewer');
    const archive = viewer.isOwner && c.req.query('status') === 'received';
    const statuses = archive ? "('received')" : viewer.isOwner ? "('draft', 'published')" : "('published')";
    const rows = db.prepare(`SELECT * FROM items WHERE status IN ${statuses} ORDER BY ${ITEM_ORDER}`).all() as ItemRow[];
    const byItem = viewer.isOwner ? new Map<number, ClaimRow[]>() : claimsByItem(db, getOpenRound(db).id);
    return c.json(rows.map((row) => toItemDto(row, byItem.get(row.id) ?? [], viewer, config)));
  });

  r.get('/items/:id', (c) => {
    const viewer = c.get('viewer');
    const item = getItem(db, parseId(c.req.param('id')));
    if (!visible(item, viewer.isOwner)) throw new HttpError(404, 'not_found');
    return c.json(dtoFor(item, viewer));
  });

  r.post('/items/:id/claim', (c) => {
    const viewer = c.get('viewer');
    const id = parseId(c.req.param('id'));
    claimFull(db, id, viewer, clock());
    return c.json(dtoFor(getItem(db, id)!, viewer));
  });

  r.delete('/items/:id/claim', (c) => {
    const viewer = c.get('viewer');
    const id = parseId(c.req.param('id'));
    releaseClaim(db, id, viewer);
    const item = getItem(db, id);
    if (!visible(item, viewer.isOwner)) throw new HttpError(404, 'not_found');
    return c.json(dtoFor(item, viewer));
  });

  r.post('/items/:id/contribute', async (c) => {
    const viewer = c.get('viewer');
    const id = parseId(c.req.param('id'));
    const body = z.object({ amountMinor: z.number().int().positive() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new HttpError(viewer.isOwner ? 403 : 400, viewer.isOwner ? 'owner_cannot_claim' : 'invalid_amount');
    contribute(db, id, viewer, body.data.amountMinor, clock());
    return c.json(dtoFor(getItem(db, id)!, viewer));
  });

  r.delete('/items/:id/contribute', (c) => {
    const viewer = c.get('viewer');
    const id = parseId(c.req.param('id'));
    withdrawContribution(db, id, viewer);
    const item = getItem(db, id);
    if (!visible(item, viewer.isOwner)) throw new HttpError(404, 'not_found');
    return c.json(dtoFor(item, viewer));
  });

  r.post('/items', requireOwner, async (c) => {
    const input = await parseBody(c, createSchema);
    priceAndCurrencyTogether(input.priceMinor, input.currency);
    if (input.groupFunding && input.priceMinor == null) throw new HttpError(400, 'price_required');
    const item = createItem(db, input as ItemInput, clock());
    return c.json(toItemDto(item, [], c.get('viewer'), config), 201);
  });

  r.post('/items/:id/publish', requireOwner, (c) => {
    const item = publishItem(db, parseId(c.req.param('id')), clock());
    if (!item) throw new HttpError(404, 'not_found');
    return c.json(toItemDto(item, [], c.get('viewer'), config));
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
    const nextGroup = 'groupFunding' in patch ? patch.groupFunding : existing.group_funding === 1;
    const nextPrice = 'priceMinor' in patch ? patch.priceMinor : existing.price_minor;
    if (nextGroup && nextPrice == null) throw new HttpError(400, 'price_required');
    const item = updateItem(db, id, patch, clock())!;

    // Contributions that no longer make sense (group funding off, new currency, price below what was raised) are
    // released and their owners told; the owner's own response is identical either way.
    const roundId = getOpenRound(db).id;
    const raised = raisedFor(db, id, roundId);
    if (raised > 0 && (item.group_funding !== 1 || item.currency !== existing.currency || raised > (item.price_minor ?? 0))) {
      for (const share of releaseShares(db, id)) {
        await deps.notifier.send(share.user_id, messages.contributionReleased(share.lang, item.title)).catch(() => false);
      }
    }
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
    await collectImage(db, config.dataDir, existing.image_file);
    // Tell people whose reservation just vanished; delivery trouble never changes the answer.
    for (const claim of claims) {
      await deps.notifier.send(claim.user_id, messages.itemRemoved(claim.lang, existing.title)).catch(() => false);
    }
    return c.json({ ok: true });
  });

  return r;
}
