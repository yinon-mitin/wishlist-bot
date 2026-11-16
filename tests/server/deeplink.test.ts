import { describe, expect, it } from 'vitest';
import { buildItemLink, buildShareUrl, parseStartParam } from '../../src/shared/deeplink';

describe('buildItemLink', () => {
  it('uses the direct link form when a Mini App short name is set', () => {
    expect(buildItemLink({ botUsername: 'my_wish_bot', appShortName: 'list' }, 7)).toBe('https://t.me/my_wish_bot/list?startapp=item_7');
  });
  it('uses the main Mini App form without a short name', () => {
    expect(buildItemLink({ botUsername: 'my_wish_bot' }, 7)).toBe('https://t.me/my_wish_bot?startapp=item_7');
    expect(buildItemLink({ botUsername: 'my_wish_bot', appShortName: null }, 7)).toBe('https://t.me/my_wish_bot?startapp=item_7');
  });
  it('returns null without a bot username', () => {
    expect(buildItemLink({}, 7)).toBeNull();
    expect(buildItemLink({ botUsername: null }, 7)).toBeNull();
  });
});

describe('buildShareUrl', () => {
  it('shares the link with only the title as text, URL-encoded (emoji and ampersand included)', () => {
    const url = buildShareUrl('https://t.me/b?startapp=item_1', 'Tea & cake 🎂');
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://t.me/share/url');
    expect(u.searchParams.get('url')).toBe('https://t.me/b?startapp=item_1');
    expect(u.searchParams.get('text')).toBe('Tea & cake 🎂');
  });
});

describe('parseStartParam', () => {
  it('extracts an item id', () => expect(parseStartParam('item_12')).toEqual({ itemId: 12 }));
  it.each(['item_abc', 'item_', 'item_-3', 'item_0', 'other_5', '', null, undefined, 'item_1.5'])('ignores %s', (v) => expect(parseStartParam(v)).toBeNull());
});
