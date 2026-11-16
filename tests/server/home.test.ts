import { describe, expect, it } from 'vitest';
import { createTestApp, guest } from '../helpers/testApp';

const home = async (t: ReturnType<typeof createTestApp>) => (await t.call('/api/home', { as: guest(1) })).json();

describe('GET /api/home', () => {
  it('counts the days to the open round date', async () => {
    const t = createTestApp(); // clock 2027-01-10, birthday 03-14
    expect(await home(t)).toEqual({ date: '2027-03-14', daysLeft: 63 });
  });

  it('is 0 on the birthday', async () => {
    const t = createTestApp();
    t.clock.set('2027-03-14T08:00:00Z');
    expect((await home(t)).daysLeft).toBe(0);
  });

  it('stays at 0 (never negative) while the round is still open after the birthday', async () => {
    const t = createTestApp();
    t.clock.set('2027-03-20T08:00:00Z');
    expect(await home(t)).toEqual({ date: '2027-03-14', daysLeft: 0 });
  });

  it('switches day at local midnight of the configured time zone', async () => {
    const t = createTestApp({ env: { TIMEZONE: 'Asia/Jerusalem' } });
    t.clock.set('2027-03-13T22:30:00Z'); // already 14 March in Jerusalem
    expect((await home(t)).daysLeft).toBe(0);
  });

  it('requires authorization', async () => {
    const t = createTestApp();
    expect((await t.call('/api/home', { as: 'anon' })).status).toBe(401);
  });
});
