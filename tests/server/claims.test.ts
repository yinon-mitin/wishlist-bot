import { describe, expect, it } from 'vitest';
import { claimFull, releaseClaim } from '../../src/server/domain/claims';
import { createItem } from '../../src/server/domain/items';
import { getOpenRound } from '../../src/server/domain/rounds';
import { HttpError } from '../../src/server/deps';
import type { Viewer } from '../../src/shared/types';
import { createTestApp } from '../helpers/testApp';

const NOW = new Date('2027-01-10T12:00:00Z');
const v = (id: number, name = `G${id}`, isOwner = false, lang: 'ru' | 'en' = 'en'): Viewer => ({ id, name, lang, isOwner });

function setup() {
  const t = createTestApp();
  const item = createItem(t.db, { title: 'Pen' }, NOW);
  return { ...t, itemId: item.id };
}

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpError) return `${e.status}:${e.code}`;
    throw e;
  }
  return 'ok';
};

describe('claimFull', () => {
  it('reserves a free item for a guest in the open round, storing name and language', () => {
    const { db, itemId } = setup();
    const claim = claimFull(db, itemId, v(5, 'Anna', false, 'ru'), NOW);
    expect(claim).toMatchObject({ item_id: itemId, user_id: 5, user_name: 'Anna', kind: 'full', amount_minor: null, lang: 'ru', round_id: getOpenRound(db).id });
  });

  it('keeps the name as it was at reservation time', () => {
    const { db, itemId } = setup();
    claimFull(db, itemId, v(5, 'Anna'), NOW);
    claimFull(db, itemId, v(5, 'Anna Renamed'), NOW);
    expect((db.prepare('SELECT user_name FROM claims').get() as { user_name: string }).user_name).toBe('Anna');
  });

  it('gives the second guest 409 already_claimed', () => {
    const { db, itemId } = setup();
    claimFull(db, itemId, v(5), NOW);
    expect(status(() => claimFull(db, itemId, v(6), NOW))).toBe('409:already_claimed');
  });

  it('is idempotent for the same guest (double tap): same claim, no duplicate row', () => {
    const { db, itemId } = setup();
    const a = claimFull(db, itemId, v(5), NOW);
    const b = claimFull(db, itemId, v(5), NOW);
    expect(b.id).toBe(a.id);
    expect((db.prepare('SELECT COUNT(*) c FROM claims').get() as { c: number }).c).toBe(1);
  });

  it('lets exactly one of many competing guests win', () => {
    const { db, itemId } = setup();
    const results = [1, 2, 3, 4, 5].map((n) => status(() => claimFull(db, itemId, v(n), NOW)));
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === '409:already_claimed')).toHaveLength(4);
  });

  it('forbids the owner with the same 403 whether or not the item is taken', () => {
    const { db, itemId } = setup();
    const free = status(() => claimFull(db, itemId, v(1000, 'Owner', true), NOW));
    claimFull(db, itemId, v(5), NOW);
    const taken = status(() => claimFull(db, itemId, v(1000, 'Owner', true), NOW));
    expect(free).toBe('403:owner_cannot_claim');
    expect(taken).toBe(free);
  });

  it('answers 404 for a missing item', () => {
    const { db } = setup();
    expect(status(() => claimFull(db, 999, v(5), NOW))).toBe('404:not_found');
  });

  it('answers 404 for an item that is not published', () => {
    const { db, itemId } = setup();
    db.prepare("UPDATE items SET status = 'draft' WHERE id = ?").run(itemId);
    expect(status(() => claimFull(db, itemId, v(5), NOW))).toBe('404:not_found');
  });
});

describe('releaseClaim', () => {
  it('lets the author release, after which another guest can reserve', () => {
    const { db, itemId } = setup();
    claimFull(db, itemId, v(5), NOW);
    releaseClaim(db, itemId, v(5));
    expect(status(() => claimFull(db, itemId, v(6), NOW))).toBe('ok');
  });

  it('refuses a release by someone else with 403 and keeps the claim', () => {
    const { db, itemId } = setup();
    claimFull(db, itemId, v(5), NOW);
    expect(status(() => releaseClaim(db, itemId, v(6)))).toBe('403:forbidden');
    expect((db.prepare('SELECT COUNT(*) c FROM claims').get() as { c: number }).c).toBe(1);
  });

  it('is a no-op when nothing is reserved', () => {
    const { db, itemId } = setup();
    expect(status(() => releaseClaim(db, itemId, v(5)))).toBe('ok');
  });

  it('forbids the owner', () => {
    const { db, itemId } = setup();
    expect(status(() => releaseClaim(db, itemId, v(1000, 'Owner', true)))).toBe('403:owner_cannot_claim');
  });
});
