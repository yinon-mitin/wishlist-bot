import type { Lang } from '../../shared/types';
import { en } from './en';
import { ru } from './ru';

export type Key = keyof typeof en;
type PluralKey = { [K in Key]: (typeof en)[K] extends readonly string[] ? K : never }[Key];
type Params = Record<string, string | number>;

const catalogs = { en, ru } as const;
let lang: Lang = 'en';

export const getLang = (): Lang => lang;
export const setLang = (l: Lang): void => {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
};

/** Telegram language_code → our language. Anything but Russian falls back to English. */
export const detectLang = (code: string | undefined | null): Lang => (code?.toLowerCase().startsWith('ru') ? 'ru' : 'en');

const fill = (s: string, params?: Params) => (params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s);

export function t(key: Key, params?: Params): string {
  const v = (catalogs[lang] as Record<string, string | readonly string[]>)[key];
  if (typeof v !== 'string') return key;
  return fill(v, params);
}

/** Plural-aware lookup: `tp('days', 3)` → "3 days" / "3 дня". */
export function tp(key: PluralKey, n: number, params?: Params): string {
  const forms = (catalogs[lang] as Record<string, string | readonly string[]>)[key] as readonly string[];
  const cat = new Intl.PluralRules(lang).select(n);
  const idx = lang === 'ru' ? (cat === 'one' ? 0 : cat === 'few' ? 1 : 2) : cat === 'one' ? 0 : 1;
  return fill(forms[idx] ?? forms[forms.length - 1]!, { n, ...params });
}
