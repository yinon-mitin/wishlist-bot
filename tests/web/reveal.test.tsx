import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/web/tg', () => ({
  initDataRaw: () => 'x',
  haptic: vi.fn(),
  ask: vi.fn(async () => true),
  prefs: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));
vi.mock('../../src/web/api', async (orig) => ({ ...(await orig<typeof import('../../src/web/api')>()), api: vi.fn() }));

import { ApiError, api } from '../../src/web/api';
import { OwnerBar } from '../../src/web/components/OwnerBar';
import { setLang } from '../../src/web/i18n';
import { Reveal } from '../../src/web/pages/admin/Reveal';
import { AppProvider } from '../../src/web/state';
import { ask } from '../../src/web/tg';

const apiMock = vi.mocked(api);
const askMock = vi.mocked(ask);
const config = { currencies: ['RUB', 'USD'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'bot', appShortName: 'app' };
const owner = { id: 1, name: 'Me', lang: 'en' as const, isOwner: true };
const mount = (ui: preact.ComponentChild) => render(<AppProvider viewer={owner} config={config} rates={null} initialCurrency="RUB">{ui}</AppProvider>);
const calls = (method: string) => apiMock.mock.calls.filter(([, o]) => (o?.method ?? 'GET') === method);

const dto = (id: number, title: string, over = {}) => ({
  id, title, description: '', url: null, priceMinor: 18900, currency: 'USD', imageUrl: null, priority: 'want', note: '', status: 'published', groupFunding: false, ...over,
});
const full = (name: string, userId = 9) => ({ userId, name, kind: 'full', amountMinor: null, mine: false });
const share = (name: string, amountMinor: number, userId = 10) => ({ userId, name, kind: 'share', amountMinor, mine: false });
const reveal = {
  round: { id: 3, year: 2027, date: '2027-03-14', status: 'open', revealedAt: null },
  items: [
    { item: dto(1, 'Keyboard'), claims: [full('Anna')] },
    { item: dto(2, 'Headphones', { groupFunding: true }), claims: [share('Boris', 4000, 10), share('Vera', 2000, 11)] },
  ],
};

beforeEach(() => {
  setLang('en');
  apiMock.mockReset();
  askMock.mockReset();
  askMock.mockResolvedValue(true);
});
afterEach(cleanup);

describe('before the birthday', () => {
  beforeEach(() => {
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/rounds/current/reveal') throw new ApiError(409, 'too_early');
      return { date: '2027-03-14', daysLeft: 12 };
    });
  });

  it('shows the countdown and no close button', async () => {
    mount(<Reveal />);
    await screen.findByText('12 days');
    expect(screen.getByText('Reservations are revealed on the birthday.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Wrap up the round' })).toBeNull();
  });

  it('the owner bar links to the reveal screen', () => {
    mount(<OwnerBar />);
    expect(screen.getByRole('link', { name: 'Reveal' }).getAttribute('href')).toBe('#/admin/reveal');
  });
});

describe('on the birthday', () => {
  beforeEach(() => {
    apiMock.mockImplementation(async (path, o) => {
      if (path === '/api/rounds/current/reveal') return reveal;
      if (path === '/api/rounds/3/close' && o?.method === 'POST') return { nextRound: { id: 4, year: 2028, date: '2028-03-14', status: 'open', revealedAt: null }, thanked: 2 };
      throw new Error(`unexpected ${path}`);
    });
  });

  it('lists who reserved each gift, including contributors with their amounts, and a Received checkbox per gift', async () => {
    mount(<Reveal />);
    await screen.findByText('Keyboard');
    expect(screen.getByText('Anna')).toBeTruthy();
    expect(screen.getByText('Boris · $40')).toBeTruthy();
    expect(screen.getByText('Vera · $20')).toBeTruthy();
    expect(screen.getByText('Raised $60 of $189')).toBeTruthy();
    expect(screen.getAllByRole('checkbox', { name: 'Received' })).toHaveLength(2);
  });

  it('asks for confirmation with the number of gifts marked, and does nothing when declined', async () => {
    askMock.mockResolvedValue(false);
    mount(<Reveal />);
    await screen.findByText('Keyboard');
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Received' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Wrap up the round' }));
    await waitFor(() => expect(askMock).toHaveBeenCalledTimes(1));
    expect(askMock.mock.calls[0]![0]).toContain('1');
    expect(calls('POST')).toHaveLength(0);
  });

  it('closes the round with the marked gifts and shows a summary with a way back', async () => {
    mount(<Reveal />);
    await screen.findByText('Keyboard');
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Received' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Wrap up the round' }));
    await screen.findByText('Round closed. Thank-you messages sent: 2.');
    expect(calls('POST')[0]).toEqual(['/api/rounds/3/close', { method: 'POST', json: { receivedItemIds: [2] } }]);
    expect(screen.getByRole('link', { name: 'Back to the list' }).getAttribute('href')).toBe('#/');
  });

  it('a double press sends one request', async () => {
    askMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return true;
    });
    mount(<Reveal />);
    await screen.findByText('Keyboard');
    const btn = screen.getByRole('button', { name: 'Wrap up the round' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByText(/Round closed/);
    expect(calls('POST')).toHaveLength(1);
  });

  it('an empty round can still be wrapped up', async () => {
    apiMock.mockImplementation(async (path) => (path === '/api/rounds/current/reveal' ? { ...reveal, items: [] } : {}));
    mount(<Reveal />);
    await screen.findByText('Nobody reserved anything yet.');
    expect(screen.getByRole('button', { name: 'Wrap up the round' })).toBeTruthy();
  });
});
