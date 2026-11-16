import { describe, expect, it } from 'vitest';
import { createTestApp, guest, owner } from '../helpers/testApp';

const BIRTHDAY_EVE = '2027-03-13T23:59:59Z';
const BIRTHDAY = '2027-03-14T00:00:00Z';

async function world(env: Record<string, string> = {}) {
  const t = createTestApp({ env });
  const mk = async (title: string) => (await (await t.call('/api/items', { as: owner, json: { title } })).json()) as { id: number };
  const A = await mk('Pen <b>');
  const B = await mk('Lamp');
  const C = await mk('Book');
  const g1 = guest(1, 'Anna', 'ru');
  const g2 = guest(2, 'Boris', 'en');
  await t.call(`/api/items/${A.id}/claim`, { as: g1, method: 'POST' });
  await t.call(`/api/items/${B.id}/claim`, { as: g2, method: 'POST' });
  const reveal = () => t.call('/api/rounds/current/reveal', { as: owner });
  const close = (roundId: number, receivedItemIds: number[]) => t.call(`/api/rounds/${roundId}/close`, { as: owner, json: { receivedItemIds } });
  return { t, A, B, C, g1, g2, reveal, close };
}

const roundId = (t: ReturnType<typeof createTestApp>) => (t.db.prepare("SELECT id FROM rounds WHERE status='open'").get() as { id: number }).id;

describe('reveal gate', () => {
  it('is closed until the birthday in the configured time zone', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY_EVE);
    const early = await w.reveal();
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ error: 'too_early' });
    expect((await w.close(roundId(w.t), [w.A.id])).status).toBe(409);
    w.t.clock.set(BIRTHDAY);
    expect((await w.reveal()).status).toBe(200);
  });

  it('uses local midnight, not UTC midnight', async () => {
    const w = await world({ TIMEZONE: 'Asia/Jerusalem' });
    w.t.clock.set('2027-03-13T21:59:59Z');
    expect((await w.reveal()).status).toBe(409);
    w.t.clock.set('2027-03-13T22:00:00Z');
    expect((await w.reveal()).status).toBe(200);
  });

  it('is for the owner only', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    expect((await w.t.call('/api/rounds/current/reveal', { as: guest(1) })).status).toBe(403);
    expect((await w.t.call(`/api/rounds/${roundId(w.t)}/close`, { as: guest(1), json: { receivedItemIds: [] } })).status).toBe(403);
  });
});

describe('reveal preview', () => {
  it('lists claimed items with who reserved them', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    const body = await (await w.reveal()).json();
    expect(body.round).toMatchObject({ date: '2027-03-14', status: 'open' });
    expect(body.items).toHaveLength(2);
    const byTitle = Object.fromEntries(body.items.map((e: any) => [e.item.title, e.claims.map((c: any) => c.name)]));
    expect(byTitle).toEqual({ 'Pen <b>': ['Anna'], Lamp: ['Boris'] });
  });
});

describe('closing the round', () => {
  it('marks received gifts, frees the others, opens next year\'s round and thanks the givers', async () => {
    const w = await world();
    w.t.clock.set('2027-03-14T18:00:00Z');
    const rid = roundId(w.t);
    const res = await w.close(rid, [w.A.id]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ thanked: 1, nextRound: { date: '2028-03-14', status: 'open' } });

    const status = (id: number) => (w.t.db.prepare('SELECT status FROM items WHERE id = ?').get(id) as { status: string }).status;
    expect(status(w.A.id)).toBe('received');
    expect(status(w.B.id)).toBe('published');
    expect(w.t.db.prepare('SELECT status FROM rounds WHERE id = ?').get(rid)).toEqual({ status: 'revealed' });
    expect(w.t.db.prepare("SELECT COUNT(*) c FROM rounds WHERE status='open'").get()).toEqual({ c: 1 });

    // not received -> reservation does not carry over; anyone can reserve again
    const view = await (await w.t.call(`/api/items/${w.B.id}`, { as: guest(3) })).json();
    expect(view.claims).toEqual([]);
    expect((await w.t.call(`/api/items/${w.B.id}/claim`, { as: guest(3), method: 'POST' })).status).toBe(200);
  });

  it('hides received gifts from guests and lists them for the owner as an archive', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    await w.close(roundId(w.t), [w.A.id]);
    const guestIds = ((await (await w.t.call('/api/items', { as: guest(3) })).json()) as { id: number }[]).map((i) => i.id);
    expect(guestIds).not.toContain(w.A.id);
    expect((await w.t.call(`/api/items/${w.A.id}`, { as: guest(3) })).status).toBe(404);
    const archive = (await (await w.t.call('/api/items?status=received', { as: owner })).json()) as { id: number; status: string }[];
    expect(archive.map((i) => [i.id, i.status])).toEqual([[w.A.id, 'received']]);
  });

  it('sends one thank-you per giver, in their language, with the title escaped', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    // Anna also reserved the lamp's neighbour: give her a second received gift
    await w.t.call(`/api/items/${w.C.id}/claim`, { as: w.g1, method: 'POST' });
    await w.close(roundId(w.t), [w.A.id, w.C.id, w.B.id]);
    const toAnna = w.t.notifier.sent.filter((m) => m.userId === w.g1.id);
    const toBoris = w.t.notifier.sent.filter((m) => m.userId === w.g2.id);
    expect(toAnna).toHaveLength(1);
    expect(toAnna[0]!.html).toMatch(/Спасибо/);
    expect(toAnna[0]!.html).toContain('Pen &lt;b&gt;');
    expect(toAnna[0]!.html).toContain('Book');
    expect(toBoris).toHaveLength(1);
    expect(toBoris[0]!.html).toMatch(/Thank you/);
  });

  it('succeeds even when a giver cannot be reached, counting only delivered thanks', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    w.t.notifier.failFor.add(w.g1.id);
    const res = await w.close(roundId(w.t), [w.A.id, w.B.id]);
    expect(res.status).toBe(200);
    expect((await res.json()).thanked).toBe(1);
  });

  it('refuses a second close of the same round and changes nothing', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    const rid = roundId(w.t);
    await w.close(rid, [w.A.id]);
    const sentBefore = w.t.notifier.sent.length;
    const again = await w.close(rid, [w.B.id]);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'already_closed' });
    expect(w.t.notifier.sent).toHaveLength(sentBefore);
    expect((w.t.db.prepare('SELECT status FROM items WHERE id = ?').get(w.B.id) as { status: string }).status).toBe('published');
    expect(w.t.db.prepare('SELECT COUNT(*) c FROM rounds').get()).toEqual({ c: 2 });
  });

  it('rejects ids that were not reserved or do not exist, atomically', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    for (const bad of [[w.A.id, w.C.id], [w.A.id, 9999]]) {
      const res = await w.close(roundId(w.t), bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_received' });
    }
    expect((w.t.db.prepare('SELECT status FROM items WHERE id = ?').get(w.A.id) as { status: string }).status).toBe('published');
    expect(w.t.db.prepare("SELECT COUNT(*) c FROM rounds WHERE status='open'").get()).toEqual({ c: 1 });
  });

  it('can close with nothing received', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    const res = await w.close(roundId(w.t), []);
    expect(res.status).toBe(200);
    expect((await res.json()).thanked).toBe(0);
  });

  it('opens the next round after the following birthday even when closed late', async () => {
    const w = await world();
    w.t.clock.set('2027-09-01T10:00:00Z');
    const res = await w.close(roundId(w.t), []);
    expect((await res.json()).nextRound.date).toBe('2028-03-14');
  });

  it('keeps the old round readable as history', async () => {
    const w = await world();
    w.t.clock.set(BIRTHDAY);
    const rid = roundId(w.t);
    await w.close(rid, [w.A.id]);
    const hist = await w.t.call(`/api/rounds/${rid}/reveal`, { as: owner });
    expect(hist.status).toBe(200);
    expect((await hist.json()).items.map((e: any) => e.item.title).sort()).toEqual(['Lamp', 'Pen <b>']);
  });
});
