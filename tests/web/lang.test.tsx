import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/web/tg', () => ({
  initDataRaw: () => 'x',
  haptic: vi.fn(),
  prefs: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));
vi.mock('../../src/web/api', async (orig) => ({ ...(await orig<typeof import('../../src/web/api')>()), api: vi.fn(async () => []) }));

import { getLang, setLang } from '../../src/web/i18n';
import { List } from '../../src/web/pages/List';
import { AppProvider } from '../../src/web/state';
import { prefs } from '../../src/web/tg';

const config = { currencies: ['RUB', 'USD'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'bot', appShortName: 'app' };
const viewer = { id: 7, name: 'Guest', lang: 'en' as const, isOwner: false };
const mount = () => render(<AppProvider viewer={viewer} config={config} rates={null} initialCurrency="RUB"><List /></AppProvider>);

beforeEach(() => {
  setLang('en');
  vi.mocked(prefs.set).mockClear();
});
afterEach(cleanup);

describe('language switch', () => {
  it('offers the other language, switches every string on the screen and remembers the choice', async () => {
    mount();
    await screen.findByText('Nothing here.');
    expect(screen.getByRole('heading', { name: 'Gifts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    await screen.findByText('Здесь пусто.');
    expect(screen.getByRole('heading', { name: 'Подарки' })).toBeTruthy();
    expect(getLang()).toBe('ru');
    expect(prefs.set).toHaveBeenCalledWith('lang', 'ru');
    expect(screen.getByRole('button', { name: 'Язык' }).textContent).toBe('EN');
  });

  it('switches back', async () => {
    mount();
    await screen.findByText('Nothing here.');
    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    await screen.findByText('Здесь пусто.');
    fireEvent.click(screen.getByRole('button', { name: 'Язык' }));
    await waitFor(() => expect(screen.getByText('Nothing here.')).toBeTruthy());
  });
});
