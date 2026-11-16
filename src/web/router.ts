export type Route =
  | { name: 'home' }
  | { name: 'list' }
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
  const m = /^item_(\d{1,10})$/.exec(p ?? '');
  return m && Number(m[1]) > 0 ? `#/item/${Number(m[1])}` : '#/';
}

export const href = {
  home: () => '#/',
  list: () => '#/items',
  item: (id: number) => `#/item/${id}`,
  adminNew: () => '#/admin/item/new',
  adminEdit: (id: number) => `#/admin/item/${id}`,
  adminReveal: () => '#/admin/reveal',
};

export const navigate = (hash: string): void => {
  location.hash = hash;
};
