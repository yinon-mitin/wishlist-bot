import { parseStartParam } from '../shared/deeplink';

export type Route =
  | { name: 'home' }
  | { name: 'list' }
  | { name: 'archive' }
  | { name: 'item'; id: number }
  | { name: 'admin-new' }
  | { name: 'admin-edit'; id: number }
  | { name: 'admin-reveal' };

const HOME: Route = { name: 'home' };
const positiveInt = (s: string | undefined): number | null => (s && /^[1-9]\d{0,9}$/.test(s) ? Number(s) : null);

/** Parses `location.hash`. Anything unknown or malformed goes home. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c] = parts;
  if (parts.length === 0) return HOME;
  if (a === 'items' && parts.length === 1) return { name: 'list' };
  if (a === 'archive' && parts.length === 1) return { name: 'archive' };
  if (a === 'item' && parts.length === 2) {
    const id = positiveInt(b);
    return id ? { name: 'item', id } : HOME;
  }
  if (a === 'admin' && b === 'item' && parts.length === 3) {
    if (c === 'new') return { name: 'admin-new' };
    const id = positiveInt(c);
    return id ? { name: 'admin-edit', id } : HOME;
  }
  if (a === 'admin' && b === 'reveal' && parts.length === 2) return { name: 'admin-reveal' };
  return HOME;
}

/** Telegram `start_param` (`item_12`) → hash to open. */
export function routeFromStartParam(p: string | null | undefined): string {
  const parsed = parseStartParam(p);
  return parsed ? `#/item/${parsed.itemId}` : '#/';
}

export const href = {
  home: () => '#/',
  list: () => '#/items',
  archive: () => '#/archive',
  item: (id: number) => `#/item/${id}`,
  adminNew: () => '#/admin/item/new',
  adminEdit: (id: number) => `#/admin/item/${id}`,
  adminReveal: () => '#/admin/reveal',
};

export const navigate = (hash: string): void => {
  location.hash = hash;
};

/**
 * The hash to start on. Telegram opens the app with `#tgWebAppData=…` already in the hash, so "empty hash" is
 * not the test: only an app route (`#/…`) means the user is already somewhere.
 */
export function initialHash(currentHash: string, startParam: string | null | undefined): string | null {
  return currentHash.startsWith('#/') ? null : routeFromStartParam(startParam);
}
