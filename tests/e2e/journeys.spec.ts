import { expect, test as base, type Browser, type Page } from '@playwright/test';
import { gzipJsBytes } from '../../scripts/check-bundle-size.mjs';
import { guest, owner, startWorld, type TestUser, type World } from './world';

const test = base.extend<{ world: World }>({
  world: async ({}, use) => {
    const world = await startWorld();
    await use(world);
    await world.close();
  },
});

async function visit(browser: Browser, world: World, user: TestUser, startParam?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await world.open(page, user, startParam);
  return page;
}

type Item = { id: number };
const addItem = (world: World, json: object) => world.api<Item>(owner, '/api/items', { json: { title: 'Gift', priceMinor: 10000, currency: 'USD', ...json } });

test('the owner creates a gift from a shop link with its photo and guests can see it', async ({ browser, world }) => {
  const page = await visit(browser, world, owner);
  await page.getByRole('link', { name: 'Add a gift' }).click();
  await page.getByLabel('Link').fill(`${world.shop}/kbd`);
  await page.getByRole('button', { name: 'Fetch from link' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Keychron Q1');
  await expect(page.getByLabel('Price')).toHaveValue('189');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: 'Keychron Q1' })).toBeVisible();
  const photo = page.locator('.th.lg img');
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  const seen = await world.api<{ title: string; imageUrl: string }[]>(guest(1), '/api/items');
  expect(seen.map((i) => i.title)).toEqual(['Keychron Q1']);
});

test('a guest reserves, a second guest sees who, and the owner sees nothing, in the page and on the wire', async ({ browser, world }) => {
  const { id } = await addItem(world, { title: 'Kettle' });
  const anna = await visit(browser, world, guest(1, 'Anna'), `item_${id}`);
  await expect(anna.getByRole('heading', { name: 'Kettle' })).toBeVisible();
  await anna.getByRole('button', { name: 'Reserve' }).click();
  await expect(anna.getByRole('button', { name: 'Cancel reservation' })).toBeVisible();

  const boris = await visit(browser, world, guest(2, 'Boris'), `item_${id}`);
  await expect(boris.getByText('Reserved by Anna')).toBeVisible();
  await expect(boris.getByRole('button', { name: 'Reserve' })).toHaveCount(0);

  const bodies: string[] = [];
  const ownerPage = await (await browser.newContext()).newPage();
  ownerPage.on('response', async (r) => {
    if (r.url().includes('/api/')) bodies.push(await r.text().catch(() => ''));
  });
  await world.open(ownerPage, owner, `item_${id}`);
  await expect(ownerPage.getByRole('heading', { name: 'Kettle' })).toBeVisible();
  await ownerPage.getByRole('link', { name: 'Back' }).click();
  await expect(ownerPage.getByText('Kettle')).toBeVisible();
  const dom = await ownerPage.content();
  for (const leak of ['Anna', 'Reserved', 'Cancel reservation']) expect(dom).not.toContain(leak);
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) expect(body).not.toMatch(/Anna|"claims"|"funding"|already_claimed/);
});

test('two guests pressing Reserve at the same moment: exactly one wins', async ({ browser, world }) => {
  const { id } = await addItem(world, { title: 'Lamp' });
  const a = await visit(browser, world, guest(1, 'Anna'), `item_${id}`);
  const b = await visit(browser, world, guest(2, 'Boris'), `item_${id}`);
  await Promise.all([a, b].map((p) => expect(p.getByRole('button', { name: 'Reserve' })).toBeVisible()));
  await Promise.all([a, b].map((p) => p.getByRole('button', { name: 'Reserve' }).click()));

  await expect.poll(() => (world.db.prepare('SELECT COUNT(*) AS n FROM claims WHERE item_id = ?').get(id) as { n: number }).n).toBe(1);
  const wins = await Promise.all([a, b].map((p) => p.getByRole('button', { name: 'Cancel reservation' }).isVisible()));
  expect(wins.filter(Boolean)).toHaveLength(1);
  const loser = wins[0] ? b : a;
  await expect(loser.getByText(/Someone has just reserved this gift|Reserved by/).first()).toBeVisible();
});

test('group funding: two chip in, a third cannot go over what is left', async ({ browser, world }) => {
  const { id } = await addItem(world, { title: 'Headphones', priceMinor: 10000, groupFunding: true });
  const chip = async (user: TestUser, amount: string) => {
    const p = await visit(browser, world, user, `item_${id}`);
    await p.getByLabel('Your amount').fill(amount);
    await p.getByRole('button', { name: 'Chip in' }).click();
    return p;
  };
  const anna = await chip(guest(1, 'Anna'), '60');
  await expect(anna.getByText('You chipped in $60')).toBeVisible();
  await chip(guest(2, 'Boris'), '30');

  const vera = await visit(browser, world, guest(3, 'Vera'), `item_${id}`);
  await expect(vera.getByText('Anna · $60')).toBeVisible();
  await expect(vera.getByText('Boris · $30')).toBeVisible();
  await vera.getByLabel('Your amount').fill('20');
  await expect(vera.getByText('You can chip in up to $10')).toBeVisible();
  await expect(vera.getByRole('button', { name: 'Chip in' })).toBeDisabled();
});

test('the interface follows the Telegram language and can be switched', async ({ browser, world }) => {
  await addItem(world, { title: 'Mug' });
  const ru = await visit(browser, world, guest(1, 'Аня', 'ru'));
  await expect(ru.getByText('Весь список · 1')).toBeVisible();
  await ru.getByRole('button', { name: 'Язык' }).click();
  await expect(ru.getByText('All gifts · 1')).toBeVisible();
  await ru.getByRole('button', { name: 'Language' }).click();
  await expect(ru.getByText('Весь список · 1')).toBeVisible();
});

test('a startapp link opens that gift; a hidden or missing one goes home with a notice', async ({ browser, world }) => {
  const { id } = await addItem(world, { title: 'Chair' });
  const draft = await addItem(world, { title: 'Secret plan', status: 'draft' });
  const page = await visit(browser, world, guest(1), `item_${id}`);
  await expect(page.getByRole('heading', { name: 'Chair' })).toBeVisible();

  const lost = await visit(browser, world, guest(2), `item_${draft.id}`);
  await expect(lost.getByText('This gift is no longer available.')).toBeVisible();
  await expect(lost.getByText('Secret plan')).toHaveCount(0);
});

test('on the birthday the owner wraps up the round, the giver is thanked and the next round starts', async ({ browser, world }) => {
  const { id } = await addItem(world, { title: 'Watch' });
  await world.api(guest(1, 'Anna'), `/api/items/${id}/claim`, { method: 'POST' });

  world.clock.set('2027-03-14T09:00:00Z');
  const page = await visit(browser, world, owner);
  await page.getByRole('link', { name: 'Reveal' }).click();
  await expect(page.getByText('Anna')).toBeVisible();
  await page.getByLabel('Received').check();
  await world.answerConfirms(page, true);
  await page.getByRole('button', { name: 'Wrap up the round' }).click();
  await expect(page.getByText('Round closed. Thank-you messages sent: 1.')).toBeVisible();

  expect(world.notifier.sent).toHaveLength(1);
  expect(world.notifier.sent[0]!.userId).toBe(guest(1).id);
  expect(world.notifier.sent[0]!.html).toContain('Watch');
  const listed = await world.api<{ title: string }[]>(guest(2), '/api/items');
  expect(listed).toEqual([]);
  const rounds = world.db.prepare("SELECT status, date FROM rounds ORDER BY id").all();
  expect(rounds).toEqual([{ status: 'revealed', date: '2027-03-14' }, { status: 'open', date: '2028-03-14' }]);
});

test('the shipped JavaScript stays within the size budget', () => {
  expect(gzipJsBytes('dist/web')).toBeLessThan(90 * 1024);
});
