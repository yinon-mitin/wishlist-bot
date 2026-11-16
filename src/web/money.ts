import type { Lang } from '../shared/types';

/** Like formatMoney, but whole amounts have no ",00" noise: 189 $, not 189.00 $. */
export function money(minor: number, currency: string, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency',
    currencyDisplay: 'narrowSymbol',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
