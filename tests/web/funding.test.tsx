import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto } from '../../src/shared/types';

vi.mock('../../src/web/tg', () => ({
  initDataRaw: () => 'x',
  haptic: vi.fn(),
  ask: vi.fn(async () => true),
  openTelegramLink: vi.fn(),
  prefs: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));
vi.mock('../../src/web/api', async (orig) => ({ ...(await orig<typeof import('../../src/web/api')>()), api: vi.fn() }));

import { ApiError, api } from '../../src/web/api';
import { setLang } from '../../src/web/i18n';
import { ItemForm } from '../../src/web/pages/admin/ItemForm';
import { Item } from '../../src/web/pages/Item';
import { AppProvider } from '../../src/web/state';

const apiMock = vi.mocked(api);
const config = { currencies: ['RUB', 'USD'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'bot', appShortName: 'app' };
const rates = { base: 'USD' as const, rates: { USD: 1, RUB: 90 }, fetchedAt: '2026-11-16T00:00:00Z' };
const guest = { id: 7, name: 'Guest', lang: 'en' as const, isOwner: false };
const owner = { ...guest, id: 1, isOwner: true };
const mount = (ui: preact.ComponentChild, viewer = guest) => render(<AppProvider viewer={viewer} config={config} rates={rates} initialCurrency="RUB">{ui}</AppProvider>);
const calls = (method: string) => apiMock.mock.calls.filter(([, o]) => (o?.method ?? 'GET') === method);
const flat = (s: string | null) => (s ?? '').replace(/[\s  ]/g, '');

const share = (name: string, amountMinor: number, mine = false) => ({ userId: mine ? 7 : 20, name, kind: 'share' as const, amountMinor, mine });
const group = (claims: ItemDto['claims'] = [share('Anna', 5000)]): ItemDto => {
  const raised = (claims ?? []).reduce((s, c) => s + (c.amountMinor ?? 0), 0);
  return {
    id: 5, title: 'Headphones', description: '', url: null, priceMinor: 18900, currency: 'USD', imageUrl: null, priority: 'want', note: '',
    status: 'published', groupFunding: true, claims, funding: { raisedMinor: raised, remainingMinor: 18900 - raised },
  };
};
const amount = () => screen.getByLabelText('Your amount') as HTMLInputElement;

beforeEach(() => {
  setLang('en');
  apiMock.mockReset();
});
afterEach(cleanup);

describe('funding bar', () => {
  it('shows raised and remaining in the chosen currency, and the original amounts too', async () => {
    apiMock.mockResolvedValue(group());
    mount(<Item id={5} />);
    await screen.findByText('Headphones');
    expect(flat(screen.getByText(/^Raised ₽/).textContent)).toBe('Raised₽4,500of₽17,010');
    expect(flat(screen.getByText(/^Still needed/).textContent)).toBe('Stillneeded:₽12,510');
    expect(screen.getByText('Raised $50 of $189')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('26');
  });

  it('lists the contributors for guests', async () => {
    apiMock.mockResolvedValue(group([share('Anna', 5000), share('Boris', 2000)]));
    mount(<Item id={5} />);
    expect(await screen.findByText('Anna · $50')).toBeTruthy();
    expect(screen.getByText('Boris · $20')).toBeTruthy();
  });

  it('shows neither the bar nor the list to the owner', async () => {
    const { claims: _c, funding: _f, ...ownerDto } = group();
    apiMock.mockResolvedValue(ownerDto);
    const { container } = mount(<Item id={5} />, owner);
    await screen.findByText('Headphones');
    expect(container.querySelector('[role=progressbar]')).toBeNull();
    expect(screen.queryByText(/Anna/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chip in' })).toBeNull();
  });
});

describe('contributing', () => {
  it('takes the amount in the gift currency and hints the ≈ value in the chosen one', async () => {
    apiMock.mockResolvedValue(group());
    mount(<Item id={5} />);
    await screen.findByText('Headphones');
    fireEvent.input(amount(), { target: { value: '10' } });
    expect(flat(screen.getByTestId('hint').textContent)).toBe('≈₽900');
  });

  it('blocks the button when the amount is more than what is still needed', async () => {
    apiMock.mockResolvedValue(group());
    mount(<Item id={5} />);
    await screen.findByText('Headphones');
    fireEvent.input(amount(), { target: { value: '200' } });
    expect((screen.getByRole('button', { name: 'Chip in' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You can chip in up to $139')).toBeTruthy();
    fireEvent.input(amount(), { target: { value: '139' } });
    expect((screen.getByRole('button', { name: 'Chip in' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends the amount in minor units and shows the updated gift', async () => {
    apiMock.mockImplementation(async (path, o) => (o?.method === 'POST' ? group([share('Anna', 5000), share('Guest', 1000, true)]) : group()));
    mount(<Item id={5} />);
    await screen.findByText('Headphones');
    fireEvent.input(amount(), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chip in' }));
    await screen.findByText('You chipped in $10');
    expect(calls('POST')[0]).toEqual(['/api/items/5/contribute', { method: 'POST', json: { amountMinor: 1000 } }]);
  });

  it('on 409 over_funded refreshes the remaining amount and says so', async () => {
    let reads = 0;
    apiMock.mockImplementation(async (path, o) => {
      if (o?.method === 'POST') throw new ApiError(409, 'over_funded');
      return reads++ === 0 ? group() : group([share('Anna', 5000), share('Boris', 12000)]);
    });
    mount(<Item id={5} />);
    await screen.findByText('Headphones');
    fireEvent.input(amount(), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chip in' }));
    await screen.findByText('Someone chipped in meanwhile. The remaining amount is updated.');
    await screen.findByText('Raised $170 of $189');
  });

  it('lets me take my share back', async () => {
    apiMock.mockImplementation(async (path, o) => (o?.method === 'DELETE' ? group() : group([share('Guest', 1000, true)])));
    mount(<Item id={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Take back my share' }));
    await waitFor(() => expect(calls('DELETE').map(([p]) => p)).toEqual(['/api/items/5/contribute']));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Take back my share' })).toBeNull());
  });

  it('shows "Fully funded" and no form when nothing is left to collect', async () => {
    apiMock.mockResolvedValue(group([share('Anna', 18900)]));
    mount(<Item id={5} />);
    await screen.findByText('Fully funded');
    expect(screen.queryByLabelText('Your amount')).toBeNull();
  });
});

describe('owner form', () => {
  it('chipping in needs a price', async () => {
    mount(<ItemForm />, owner);
    fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Headphones' } });
    fireEvent.click(screen.getByLabelText('Allow chipping in'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Chipping in needs a price.');
    expect(apiMock).not.toHaveBeenCalled();
  });
});
