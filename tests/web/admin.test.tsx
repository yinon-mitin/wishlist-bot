import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto } from '../../src/shared/types';

vi.mock('../../src/web/tg', () => ({
  initDataRaw: () => 'x',
  haptic: vi.fn(),
  ask: vi.fn(async () => true),
  prefs: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));
vi.mock('../../src/web/api', async (orig) => ({ ...(await orig<typeof import('../../src/web/api')>()), api: vi.fn() }));

import { ApiError, api } from '../../src/web/api';
import { Routes } from '../../src/web/App';
import { OwnerBar } from '../../src/web/components/OwnerBar';
import { setLang } from '../../src/web/i18n';
import { ItemForm } from '../../src/web/pages/admin/ItemForm';
import { Item } from '../../src/web/pages/Item';
import { AppProvider } from '../../src/web/state';
import { ask } from '../../src/web/tg';

const apiMock = vi.mocked(api);
const askMock = vi.mocked(ask);
const config = { currencies: ['RUB', 'USD', 'ILS'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'bot', appShortName: 'app' };
const guest = { id: 7, name: 'Guest', lang: 'en' as const, isOwner: false };
const owner = { ...guest, id: 1, isOwner: true };
const mount = (ui: preact.ComponentChild, viewer = owner) =>
  render(<AppProvider viewer={viewer} config={config} rates={null} initialCurrency="RUB">{ui}</AppProvider>);

const saved = (over: Partial<ItemDto> = {}): ItemDto => ({
  id: 5, title: 'Keyboard', description: '', url: null, priceMinor: null, currency: null, imageUrl: null,
  priority: 'want', note: '', status: 'published', groupFunding: false, ...over,
});
const preview = (over = {}) => ({ title: 'Keychron Q1', description: 'Aluminium', imageUrl: 'https://shop.example/i.jpg', priceMinor: 18900, currency: 'USD', siteName: 'Shop', ...over });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const calls = (method: string) => apiMock.mock.calls.filter(([, o]) => (o?.method ?? 'GET') === method);

beforeEach(() => {
  setLang('en');
  apiMock.mockReset();
  askMock.mockReset();
  askMock.mockResolvedValue(true);
  location.hash = '';
});
afterEach(cleanup);

describe('access', () => {
  it('OwnerBar renders for the owner and not for a guest', () => {
    mount(<OwnerBar />, owner);
    expect(screen.getByRole('link', { name: 'Add a gift' })).toBeTruthy();
    cleanup();
    const { container } = mount(<OwnerBar />, guest);
    expect(container.textContent).toBe('');
  });

  it('a guest who opens #/admin/* is sent home', async () => {
    apiMock.mockResolvedValue([]);
    location.hash = '#/admin/item/new';
    mount(<Routes />, guest);
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('the owner sees no reservation controls or statuses on a gift', async () => {
    apiMock.mockResolvedValue(saved());
    mount(<Item id={5} />);
    await screen.findByText('Keyboard');
    expect(screen.queryByRole('button', { name: 'Reserve' })).toBeNull();
    expect(screen.queryByText(/Reserved/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy();
  });
});

describe('fetch from link', () => {
  const press = async () => {
    fireEvent.input(field('Link'), { target: { value: 'https://shop.example/kbd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch from link' }));
  };

  it('fills title, description, price and currency from the preview', async () => {
    apiMock.mockResolvedValue(preview());
    mount(<ItemForm />);
    await press();
    await waitFor(() => expect(field('Title').value).toBe('Keychron Q1'));
    expect(field('Description').value).toBe('Aluminium');
    expect(field('Price').value).toBe('189');
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('USD');
    expect(calls('POST')[0]).toEqual(['/api/link-preview', { method: 'POST', json: { url: 'https://shop.example/kbd' } }]);
  });

  it('keeps what was typed by hand when the owner declines to replace it', async () => {
    apiMock.mockResolvedValue(preview());
    askMock.mockResolvedValue(false);
    mount(<ItemForm />);
    fireEvent.input(field('Title'), { target: { value: 'My own title' } });
    await press();
    await waitFor(() => expect(field('Description').value).toBe('Aluminium'));
    expect(field('Title').value).toBe('My own title');
    expect(askMock).toHaveBeenCalledTimes(1);
  });

  it('replaces typed fields after confirmation', async () => {
    apiMock.mockResolvedValue(preview());
    mount(<ItemForm />);
    fireEvent.input(field('Title'), { target: { value: 'My own title' } });
    await press();
    await waitFor(() => expect(field('Title').value).toBe('Keychron Q1'));
  });

  it('shows a soft message when the link is blocked, and the form keeps working', async () => {
    apiMock.mockResolvedValue(preview({ title: null, description: null, imageUrl: null, priceMinor: null, currency: null, error: 'blocked' }));
    mount(<ItemForm />);
    await press();
    await screen.findByText(/can’t be opened from here/);
    fireEvent.input(field('Title'), { target: { value: 'By hand' } });
    expect(field('Title').value).toBe('By hand');
  });

  it('shows the same soft message when the request itself fails', async () => {
    apiMock.mockRejectedValue(new ApiError(0, 'network'));
    mount(<ItemForm />);
    await press();
    await screen.findByText('No connection. Try again.');
  });
});

describe('saving', () => {
  it('rejects an empty title without calling the API', async () => {
    mount(<ItemForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Enter a title.');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('rejects a price without a currency', async () => {
    mount(<ItemForm />);
    fireEvent.input(field('Title'), { target: { value: 'Book' } });
    fireEvent.input(field('Price'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Choose a currency for the price.');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('rejects an unreadable price', async () => {
    mount(<ItemForm />);
    fireEvent.input(field('Title'), { target: { value: 'Book' } });
    fireEvent.input(field('Price'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Enter a price/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('creates a gift, then attaches the image found on the link, then opens it', async () => {
    apiMock.mockImplementation(async (path) => (path === '/api/link-preview' ? preview() : saved()));
    mount(<ItemForm />);
    fireEvent.input(field('Link'), { target: { value: 'https://shop.example/kbd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch from link' }));
    await waitFor(() => expect(field('Title').value).toBe('Keychron Q1'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(location.hash).toBe('#/item/5'));
    const posts = calls('POST').map(([p, o]) => [p, (o as { json?: unknown }).json]);
    expect(posts[1]).toEqual([
      '/api/items',
      { title: 'Keychron Q1', description: 'Aluminium', url: 'https://shop.example/kbd', priceMinor: 18900, currency: 'USD', priority: 'want', note: '', groupFunding: false },
    ]);
    expect(posts[2]).toEqual(['/api/items/5/image-from-url', { url: 'https://shop.example/i.jpg' }]);
  });

  it('edits an existing gift with PATCH', async () => {
    apiMock.mockImplementation(async (path, o) => (o?.method === 'PATCH' ? saved({ title: 'Renamed' }) : saved({ priceMinor: 1250, currency: 'EUR' as never })));
    mount(<ItemForm id={5} />);
    await waitFor(() => expect(field('Title').value).toBe('Keyboard'));
    expect(field('Price').value).toBe('12.50');
    fireEvent.input(field('Title'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1));
    expect(calls('PATCH')[0]![0]).toBe('/api/items/5');
    expect((calls('PATCH')[0]![1] as { json: { title: string } }).json.title).toBe('Renamed');
  });

  it('keeps the form and offers another try when saving fails', async () => {
    apiMock.mockRejectedValue(new ApiError(500, 'internal'));
    mount(<ItemForm />);
    fireEvent.input(field('Title'), { target: { value: 'Book' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Something went wrong. Try again.');
    expect(field('Title').value).toBe('Book');
  });
});

describe('deleting', () => {
  const open = async () => {
    apiMock.mockResolvedValue(saved());
    mount(<ItemForm id={5} />);
    await waitFor(() => expect(field('Title').value).toBe('Keyboard'));
  };

  it('asks for confirmation and does nothing when declined', async () => {
    await open();
    askMock.mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(askMock).toHaveBeenCalled());
    expect(calls('DELETE')).toHaveLength(0);
  });

  it('deletes after confirmation and returns to the list', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE').map(([p]) => p)).toEqual(['/api/items/5']));
    await waitFor(() => expect(location.hash).toBe('#/items'));
  });
});
