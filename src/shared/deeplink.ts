export interface LinkConfig {
  botUsername?: string | null;
  appShortName?: string | null;
}

/** A t.me link that opens the mini-app straight on one gift. Null when the bot username is unknown. */
export function buildItemLink(cfg: LinkConfig, itemId: number): string | null {
  if (!cfg.botUsername) return null;
  const base = cfg.appShortName ? `https://t.me/${cfg.botUsername}/${cfg.appShortName}` : `https://t.me/${cfg.botUsername}`;
  return `${base}?startapp=item_${itemId}`;
}

/** Telegram's share dialog. The text carries only the gift title, never anything about reservations. */
export function buildShareUrl(link: string, title: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`;
}

export function parseStartParam(param: string | null | undefined): { itemId: number } | null {
  const m = /^item_(\d+)$/.exec(param ?? '');
  if (!m) return null;
  const itemId = Number(m[1]);
  return Number.isSafeInteger(itemId) && itemId > 0 ? { itemId } : null;
}
