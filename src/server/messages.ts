import type { Lang } from '../shared/types';
import { escapeHtml } from './util/html';

/** Texts the server sends through the bot. Callers pass raw user text; escaping happens here. */
export const messages = {
  itemRemoved(lang: Lang, title: string): string {
    const t = escapeHtml(title);
    return lang === 'ru'
      ? `Подарок «${t}» убран из вишлиста, ваша бронь снята.`
      : `The gift “${t}” was removed from the wishlist, so your reservation was released.`;
  },
};
