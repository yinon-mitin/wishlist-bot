import { describe, expect, it } from 'vitest';
import { parseRoute, routeFromStartParam } from '../../src/web/router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/items', { name: 'list' }],
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
