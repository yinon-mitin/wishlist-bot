import { describe, expect, it } from 'vitest';
import { initialHash, parseRoute, routeFromStartParam } from '../../src/web/router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/items', { name: 'list' }],
    ['#/archive', { name: 'archive' }],
    ['#/item/12', { name: 'item', id: 12 }],
    ['#/admin/item/new', { name: 'admin-new' }],
    ['#/admin/item/7', { name: 'admin-edit', id: 7 }],
    ['#/admin/reveal', { name: 'admin-reveal' }],
  ])('%s', (hash, route) => expect(parseRoute(hash)).toEqual(route));

  it.each(['#/item/abc', '#/item/0', '#/item/-3', '#/nope', '#/admin', '#/admin/item/x', '#//'])('falls back to home for %s', (hash) => {
    expect(parseRoute(hash)).toEqual({ name: 'home' });
  });
});

describe('routeFromStartParam', () => {
  it('opens a gift from item_12', () => expect(routeFromStartParam('item_12')).toBe('#/item/12'));
  it.each(['item_abc', '', null, 'x'])('goes home for %s', (p) => expect(routeFromStartParam(p)).toBe('#/'));
});

describe('initialHash (Telegram launches with #tgWebAppData=… in the hash)', () => {
  it('opens the gift from start_param even though Telegram has already filled the hash', () => {
    expect(initialHash('#tgWebAppData=query_id%3DAA&tgWebAppVersion=8.0', 'item_5')).toBe('#/item/5');
  });
  it('opens the gift when the hash is empty', () => expect(initialHash('', 'item_5')).toBe('#/item/5'));
  it('goes home when there is no start_param', () => expect(initialHash('#tgWebAppData=x', null)).toBe('#/'));
  it('keeps an app route that is already in the hash (page reload)', () => expect(initialHash('#/items', 'item_5')).toBeNull());
});
