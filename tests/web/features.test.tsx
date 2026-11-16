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
import { Countdown } from '../../src/web/components/Countdown';
import { ItemCard } from '../../src/web/components/ItemCard';
import { Notice } from '../../src/web/components/Notice';
import { PriorityBadge } from '../../src/web/components/PriorityBadge';
import { setLang } from '../../src/web/i18n';
import { Home } from '../../src/web/pages/Home';
import { ItemForm } from '../../src/web/pages/admin/ItemForm';
import { Item } from '../../src/web/pages/Item';
import { AppProvider } from '../../src/web/state';
import { openTelegramLink } from '../../src/web/tg';

const apiMock = vi.mocked(api);
const baseConfig = { currencies: ['RUB', 'USD'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'bot' as string | null, appShortName: 'app' as string | null };
const guest = { id: 7, name: 'Guest', lang: 'en' as const, isOwner: false };
const owner = { ...guest, id: 1, isOwner: true };
const item = (over: Partial<ItemDto> = {}): ItemDto => ({
  id: 5, title: 'Keyboard', description: '', url: null, priceMinor: null, currency: null, imageUrl: null,
  priority: 'want', note: '', status: 'published', groupFunding: false, claims: [], ...over,
});
const mount = (ui: preact.ComponentChild, viewer = guest, config = baseConfig) =>
  render(<AppProvider viewer={viewer} config={config} rates={null} initialCurrency="RUB">{ui}</AppProvider>);
const calls = (method: string) => apiMock.mock.calls.filter(([, o]) => (o?.method ?? 'GET') === method);
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  setLang('en');
  apiMock.mockReset();
  vi.mocked(openTelegramLink).mockClear();
  location.hash = '';
});
afterEach(cleanup);

describe('countdown', () => {
  it('counts days with the right plural form in English', () => {
    mount(<Countdown daysLeft={1} date="2027-03-14" />);
    expect(screen.getByText('1 day')).toBeTruthy();
    cleanup();
    mount(<Countdown daysLeft={2} date="2027-03-14" />);
    expect(screen.getByText('2 days')).toBeTruthy();
  });

  it('counts days with the right plural form in Russian', () => {
    setLang('ru');
    const seen = [1, 2, 5, 21].map((n) => {
      const { container, unmount } = mount(<Countdown daysLeft={n} date="2027-03-14" />);
      const text = container.querySelector('.count b')!.textContent;
      unmount();
      return text;
    });
    expect(seen).toEqual(['1 день', '2 дня', '5 дней', '21 день']);
  });

  it('shows "Today is the day!" on the birthday', () => {
    mount(<Countdown daysLeft={0} date="2027-03-14" />);
    expect(screen.getByText('Today is the day!')).toBeTruthy();
  });

  it('formats the date in the viewer language', () => {
    mount(<Countdown daysLeft={10} date="2027-03-14" />);
    expect(screen.getByText(/March 14/)).toBeTruthy();
  });

  it('Home shows the countdown above the gifts, and still works if the countdown request fails', async () => {
    apiMock.mockImplementation(async (path) => (path === '/api/home' ? { date: '2027-03-14', daysLeft: 10 } : [item()]));
    mount(<Home />);
    await screen.findByText('10 days');
    cleanup();
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/home') throw new ApiError(500, 'internal');
      return [item()];
    });
    mount(<Home />);
    await screen.findByText('All gifts · 1');
    expect(screen.queryByText(/days/)).toBeNull();
  });
});

describe('priority and notes', () => {
  it('the badge says how much the gift is wanted', () => {
    mount(<PriorityBadge priority="must" />);
    expect(screen.getByText('Most wanted')).toBeTruthy();
  });

  it('a gift page shows the badge and the note; a note with a line break and markup is plain text', async () => {
    apiMock.mockResolvedValue(item({ priority: 'must', note: 'colour: grey\n<b>not bold</b>' }));
    const { container } = mount(<Item id={5} />);
    await screen.findByText('Keyboard');
    expect(container.querySelector('.badge')!.textContent).toBe('Most wanted');
    const note = container.querySelector('.note')!;
    expect(note.querySelector('b')).toBeNull();
    expect(note.textContent).toContain('colour: grey\n<b>not bold</b>');
  });

  it('the form saves the chosen priority', async () => {
    apiMock.mockResolvedValue(item());
    mount(<ItemForm />, owner);
    fireEvent.input(field('Title'), { target: { value: 'Book' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'must' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect((calls('POST')[0]![1] as { json: { priority: string } }).json.priority).toBe('must');
  });
});

describe('drafts', () => {
  it('marks a draft for the owner in the list', () => {
    mount(<ItemCard item={item({ status: 'draft', claims: undefined })} />, owner);
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('does not mark published gifts', () => {
    mount(<ItemCard item={item({ claims: undefined })} />, owner);
    expect(screen.queryByText('Draft')).toBeNull();
  });

  it('the form can save a new gift as a hidden draft', async () => {
    apiMock.mockResolvedValue(item({ status: 'draft' }));
    mount(<ItemForm />, owner);
    fireEvent.input(field('Title'), { target: { value: 'Book' } });
    fireEvent.click(screen.getByLabelText('Keep hidden until I publish'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect((calls('POST')[0]![1] as { json: { status: string } }).json.status).toBe('draft');
  });

  it('a regular new gift is not sent as a draft, and edits never send a status', async () => {
    apiMock.mockResolvedValue(item());
    mount(<ItemForm />, owner);
    fireEvent.input(field('Title'), { target: { value: 'Book' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect((calls('POST')[0]![1] as { json: Record<string, unknown> }).json).not.toHaveProperty('status');
    cleanup();
    apiMock.mockReset();
    apiMock.mockResolvedValue(item({ status: 'draft' }));
    mount(<ItemForm id={5} />, owner);
    await waitFor(() => expect(field('Title').value).toBe('Keyboard'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1));
    expect((calls('PATCH')[0]![1] as { json: Record<string, unknown> }).json).not.toHaveProperty('status');
  });

  it('publishing a draft calls the publish endpoint and removes the button', async () => {
    apiMock.mockImplementation(async (path, o) => (o?.method === 'POST' ? item({ status: 'published', claims: undefined }) : item({ status: 'draft', claims: undefined })));
    mount(<Item id={5} />, owner);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull());
    expect(calls('POST').map(([p]) => p)).toEqual(['/api/items/5/publish']);
  });
});

describe('share and deep links', () => {
  it('Share opens the Telegram share dialog with a link to the gift and only its title', async () => {
    apiMock.mockResolvedValue(item({ title: 'Mug & ☕ <3', claims: [{ userId: 9, name: 'Anna', kind: 'full', amountMinor: null, mine: false }] }));
    mount(<Item id={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    const link = 'https://t.me/bot/app?startapp=item_5';
    expect(openTelegramLink).toHaveBeenCalledWith(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Mug & ☕ <3')}`);
    const url = vi.mocked(openTelegramLink).mock.calls[0]![0];
    expect(url).not.toContain('Anna');
    expect(new URL(url).searchParams.get('text')).toBe('Mug & ☕ <3');
  });

  it('has no Share button when the bot username is not configured', async () => {
    apiMock.mockResolvedValue(item());
    mount(<Item id={5} />, guest, { ...baseConfig, botUsername: null });
    await screen.findByText('Keyboard');
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('a link to a missing or hidden gift goes home with a soft notice, not an empty screen', async () => {
    apiMock.mockRejectedValue(new ApiError(404, 'not_found'));
    location.hash = '#/item/99';
    mount(<><Notice /><Item id={99} /></>);
    await waitFor(() => expect(location.hash).toBe('#/'));
    await screen.findByText('This gift is no longer available.');
  });
});
