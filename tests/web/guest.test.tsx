import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto } from '../../src/shared/types';

const store = new Map<string, string>();
vi.mock('../../src/web/tg', () => ({
  initDataRaw: () => 'x',
  haptic: vi.fn(),
  prefs: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  },
}));
vi.mock('../../src/web/api', async (orig) => ({ ...(await orig<typeof import('../../src/web/api')>()), api: vi.fn() }));

import { ApiError, api } from '../../src/web/api';
import { AppProvider } from '../../src/web/state';
import { setLang } from '../../src/web/i18n';
import { haptic, prefs } from '../../src/web/tg';
import { Home } from '../../src/web/pages/Home';
import { List } from '../../src/web/pages/List';
import { Item } from '../../src/web/pages/Item';

const apiMock = vi.mocked(api);
const config = { currencies: ['RUB', 'USD', 'ILS'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'bot', appShortName: 'app' };
const rates = { base: 'USD' as const, rates: { USD: 1, RUB: 90, ILS: 3.6 }, fetchedAt: '2026-11-16T00:00:00Z' };
const guest = { id: 7, name: 'Guest', lang: 'en' as const, isOwner: false };
const owner = { ...guest, id: 1, isOwner: true };

const item = (over: Partial<ItemDto> = {}): ItemDto => ({
  id: 5, title: 'Keyboard', description: 'Aluminium case', url: 'https://shop.example/kbd', priceMinor: 18900, currency: 'USD',
  imageUrl: null, priority: 'must', note: '', status: 'published', groupFunding: false, claims: [], ...over,
});
const claim = (over = {}) => ({ userId: 9, name: 'Anna', kind: 'full' as const, amountMinor: null, mine: false, ...over });

const mount = (ui: preact.ComponentChild, viewer = guest, currency = 'RUB') =>
  render(<AppProvider viewer={viewer} config={config} rates={rates} initialCurrency={currency}>{ui}</AppProvider>);
const flat = (s: string | null) => (s ?? '').replace(/[\s  ]/g, '');
const calls = (method: string) => apiMock.mock.calls.filter(([, o]) => (o?.method ?? 'GET') === method);

beforeEach(() => {
  setLang('en');
  store.clear();
  apiMock.mockReset();
  vi.mocked(haptic).mockClear();
  vi.mocked(prefs.set).mockClear();
});
afterEach(cleanup);

describe('prices', () => {
  it('shows the original price and the ≈ price in the selected currency', async () => {
    apiMock.mockResolvedValue(item());
    mount(<Item id={5} />);
    await screen.findByText('Keyboard');
    expect(flat(screen.getByTestId('price').textContent)).toContain('$189');
    expect(flat(screen.getByTestId('approx').textContent)).toContain('₽17,010');
  });

  it('recalculates when the currency changes and remembers the choice', async () => {
    apiMock.mockResolvedValue(item());
    mount(<Item id={5} />);
    await screen.findByText('Keyboard');
    fireEvent.click(screen.getByRole('button', { name: 'ILS' }));
    await waitFor(() => expect(flat(screen.getByTestId('approx').textContent)).toContain('₪680.40'));
    expect(prefs.set).toHaveBeenCalledWith('currency', 'ILS');
  });
});

describe('reserving', () => {
  it('a free gift offers Reserve; pressing it POSTs the claim and gives haptic feedback', async () => {
    apiMock.mockImplementation(async (path, o) => (o?.method === 'POST' ? item({ claims: [claim({ userId: 7, name: 'Guest', mine: true })] }) : item()));
    mount(<Item id={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reserve' }));
    await screen.findByRole('button', { name: 'Cancel reservation' });
    expect(calls('POST').map(([p]) => p)).toEqual(['/api/items/5/claim']);
    expect(haptic).toHaveBeenCalledWith('success');
  });

  it("someone else's reservation shows their name and offers no buttons", async () => {
    apiMock.mockResolvedValue(item({ claims: [claim()] }));
    mount(<Item id={5} />);
    await screen.findByText('Keyboard');
    expect(screen.getByText('Reserved by Anna')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reserve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel reservation' })).toBeNull();
  });

  it('my own reservation can be cancelled with DELETE', async () => {
    apiMock.mockImplementation(async (path, o) => (o?.method === 'DELETE' ? item() : item({ claims: [claim({ userId: 7, mine: true })] })));
    mount(<Item id={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
    await screen.findByRole('button', { name: 'Reserve' });
    expect(calls('DELETE').map(([p]) => p)).toEqual(['/api/items/5/claim']);
  });

  it('on 409 shows a message and reloads the gift', async () => {
    apiMock.mockImplementation(async (path, o) => {
      if (o?.method === 'POST') throw new ApiError(409, 'already_claimed');
      return calls('GET').length > 1 ? item({ claims: [claim()] }) : item();
    });
    mount(<Item id={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reserve' }));
    await screen.findByText('Someone has just reserved this gift.');
    await screen.findByText('Reserved by Anna');
  });

  it('a double click sends a single request', async () => {
    let release!: (v: ItemDto) => void;
    apiMock.mockImplementation((path, o) => (o?.method === 'POST' ? new Promise((r) => (release = r as never)) : Promise.resolve(item())));
    mount(<Item id={5} />);
    const btn = await screen.findByRole('button', { name: 'Reserve' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(calls('POST')).toHaveLength(1);
    release(item({ claims: [claim({ userId: 7, mine: true })] }));
    await screen.findByRole('button', { name: 'Cancel reservation' });
  });

  it('prints a guest name containing markup as text', async () => {
    apiMock.mockResolvedValue(item({ claims: [claim({ name: '<script>alert(1)</script>' })] }));
    const { container } = mount(<Item id={5} />);
    await screen.findByText(/<script>alert\(1\)<\/script>/);
    expect(container.querySelector('script')).toBeNull();
  });

  it('a group-funded gift has no Reserve button (funding UI comes later)', async () => {
    apiMock.mockResolvedValue(item({ groupFunding: true, funding: { raisedMinor: 0, remainingMinor: 18900 } }));
    mount(<Item id={5} />);
    await screen.findByText('Keyboard');
    expect(screen.queryByRole('button', { name: 'Reserve' })).toBeNull();
  });
});

describe('list and home', () => {
  it('shows a friendly empty state', async () => {
    apiMock.mockResolvedValue([]);
    mount(<List />);
    await screen.findByText('Nothing here.');
  });

  it('marks each row: available, reserved by name, mine', async () => {
    apiMock.mockResolvedValue([
      item({ id: 1, title: 'A' }),
      item({ id: 2, title: 'B', claims: [claim()] }),
      item({ id: 3, title: 'C', claims: [claim({ userId: 7, mine: true })] }),
    ]);
    mount(<List />);
    await screen.findByText('A');
    expect(screen.getByText('Available', { selector: '.st' })).toBeTruthy();
    expect(screen.getByText('Anna')).toBeTruthy();
    expect(screen.getByText('Yours')).toBeTruthy();
  });

  it('the available filter hides reserved gifts', async () => {
    apiMock.mockResolvedValue([item({ id: 1, title: 'A' }), item({ id: 2, title: 'B', claims: [claim()] })]);
    mount(<List />);
    await screen.findByText('B');
    fireEvent.click(screen.getByRole('button', { name: 'Available' }));
    expect(screen.queryByText('B')).toBeNull();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('the owner sees no reservation names or statuses', async () => {
    apiMock.mockResolvedValue([item({ id: 1, title: 'A', claims: undefined })]);
    const { container } = mount(<List />, owner);
    await screen.findByText('A');
    expect(container.querySelector('.st')).toBeNull();
  });

  it('home shows the most wanted gifts and the count of all gifts', async () => {
    apiMock.mockResolvedValue([item({ id: 1, title: 'A' }), item({ id: 2, title: 'B', priority: 'want' })]);
    mount(<Home />);
    await screen.findByText('A');
    expect(screen.getByText('Most wanted')).toBeTruthy();
    expect(screen.queryByText('B')).toBeNull();
    expect(screen.getByText('All gifts · 2')).toBeTruthy();
  });
});

describe('failures', () => {
  it('offline: shows a message and a retry button that reloads', async () => {
    apiMock.mockRejectedValueOnce(new ApiError(0, 'network')).mockResolvedValue([]);
    mount(<List />);
    await screen.findByText('No connection. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Nothing here.');
  });
});
