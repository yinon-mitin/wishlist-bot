import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto } from '../../src/shared/types';

vi.mock('../../src/web/tg', () => ({
  initDataRaw: () => 'x',
  haptic: vi.fn(),
  ask: vi.fn(async () => true),
  prefs: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));
vi.mock('../../src/web/api', async (orig) => ({ ...(await orig<typeof import('../../src/web/api')>()), api: vi.fn() }));

import { api } from '../../src/web/api';
import { Routes } from '../../src/web/App';
import { OwnerBar } from '../../src/web/components/OwnerBar';
import { setLang } from '../../src/web/i18n';
import { ItemForm } from '../../src/web/pages/admin/ItemForm';
import { Item } from '../../src/web/pages/Item';
import { List } from '../../src/web/pages/List';
import { AppProvider } from '../../src/web/state';
import { ask } from '../../src/web/tg';

const apiMock = vi.mocked(api);
const askMock = vi.mocked(ask);
const config = { currencies: ['RUB', 'USD'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'bot', appShortName: 'app' };
const guest = { id: 7, name: 'Guest', lang: 'en' as const, isOwner: false };
const owner = { ...guest, id: 1, isOwner: true };
const mount = (ui: preact.ComponentChild, viewer = owner) =>
  render(<AppProvider viewer={viewer} config={config} rates={null} initialCurrency="RUB">{ui}</AppProvider>);
const item = (over: Partial<ItemDto> = {}): ItemDto => ({
  id: 5, title: 'Keyboard', description: '', url: null, priceMinor: null, currency: null, imageUrl: null,
  category: '', priority: 'want', note: '', status: 'published', groupFunding: false, ...over,
});
const calls = (method: string) => apiMock.mock.calls.filter(([, o]) => (o?.method ?? 'GET') === method);
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  setLang('en');
  apiMock.mockReset();
  askMock.mockReset();
  askMock.mockResolvedValue(true);
  location.hash = '';
});
afterEach(cleanup);

describe('categories in the list', () => {
  it('groups gifts under a heading per category, with a heading for gifts without one', async () => {
    apiMock.mockResolvedValue([
      item({ id: 1, title: 'Drill', category: 'Home' }),
      item({ id: 2, title: 'Pot', category: 'Garden' }),
      item({ id: 3, title: 'Lamp', category: 'Home' }),
      item({ id: 4, title: 'Zippo', category: '' }),
    ]);
    mount(<List />);
    await screen.findByText('Drill');
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Home', 'Garden', 'Other']);
    const home = screen.getByRole('heading', { name: 'Home' }).closest('section')!;
    expect(within(home).getByText('Drill')).toBeTruthy();
    expect(within(home).getByText('Lamp')).toBeTruthy();
    expect(within(home).queryByText('Pot')).toBeNull();
  });
});

describe('category field', () => {
  it('is saved with the gift', async () => {
    apiMock.mockResolvedValue(item());
    mount(<ItemForm />);
    fireEvent.input(field('Title'), { target: { value: 'Drill' } });
    fireEvent.input(field('Category'), { target: { value: '  Home ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect((calls('POST')[0]![1] as { json: { category: string } }).json.category).toBe('Home');
  });

  it('is filled in when editing', async () => {
    apiMock.mockResolvedValue(item({ category: 'Garden' }));
    mount(<ItemForm id={5} />);
    await waitFor(() => expect(field('Category').value).toBe('Garden'));
  });
});

describe('archive', () => {
  it('is linked from the owner bar and called Archive', () => {
    mount(<OwnerBar />);
    expect(screen.getByRole('link', { name: 'Archive' }).getAttribute('href')).toBe('#/archive');
  });

  it('#/archive lists received and bought gifts, titled Archive, without the owner bar', async () => {
    apiMock.mockResolvedValue([item({ id: 1, title: 'Old lamp', status: 'archived' })]);
    location.hash = '#/archive';
    mount(<Routes />);
    await screen.findByText('Old lamp');
    expect(apiMock).toHaveBeenCalledWith('/api/items?status=archive');
    expect(screen.getByRole('heading', { level: 1, name: 'Archive' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Add a gift' })).toBeNull();
  });

  it('has its own empty state', async () => {
    apiMock.mockResolvedValue([]);
    mount(<List archive />);
    await screen.findByText('Nothing here.');
  });
});

describe('marking a gift', () => {
  it('Received asks first, then posts and returns to the list', async () => {
    apiMock.mockResolvedValue(item());
    mount(<Item id={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Received' }));
    await waitFor(() => expect(calls('POST').map(([p]) => p)).toEqual(['/api/items/5/received']));
    expect(askMock).toHaveBeenCalledWith('Mark this gift as received?');
    expect(location.hash).toBe('#/items');
  });

  it('does nothing when the owner declines the question', async () => {
    askMock.mockResolvedValue(false);
    apiMock.mockResolvedValue(item());
    mount(<Item id={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Received' }));
    await waitFor(() => expect(askMock).toHaveBeenCalled());
    expect(calls('POST')).toHaveLength(0);
  });

  it('shows no Bought or Received buttons on a draft', async () => {
    apiMock.mockResolvedValue(item({ status: 'draft' }));
    mount(<Item id={5} />);
    await screen.findByText('Keyboard');
    expect(screen.queryByRole('button', { name: 'Received' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bought it myself' })).toBeNull();
  });

  it.each(['received', 'archived'] as const)('a %s gift can be put back, and goes back to the archive from there', async (status) => {
    apiMock.mockResolvedValue(item({ status }));
    mount(<Item id={5} />);
    expect(await screen.findByRole('link', { name: 'Back' })).toHaveProperty('hash', '#/archive');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the wishlist' }));
    await waitFor(() => expect(calls('POST').map(([p]) => p)).toEqual(['/api/items/5/restore']));
    expect(location.hash).toBe('#/items');
  });

  it('a guest gets none of these buttons', async () => {
    apiMock.mockResolvedValue(item({ claims: [] } as Partial<ItemDto>));
    mount(<Item id={5} />, guest);
    await screen.findByText('Keyboard');
    for (const name of ['Received', 'Bought it myself', 'Back to the wishlist']) expect(screen.queryByRole('button', { name })).toBeNull();
  });
});
