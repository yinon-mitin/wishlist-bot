import type { Lang, Rates } from './types';

/**
 * Parses a human-typed price into minor units (2 decimals). Accepts "1299", "1 299,50", "1,299.50".
 * A lone separator followed by exactly three digits is a thousands separator ("1,299" = 1299).
 */
export function toMinor(input: string, _currency?: string): number | null {
  const s = input.replace(/[\s\u00a0\u202f]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let decimalAt = -1; // index of the decimal separator, -1 when there is none
  if (hasDot && hasComma) {
    decimalAt = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const lone = s.indexOf(sep) === s.lastIndexOf(sep);
    const after = s.length - s.lastIndexOf(sep) - 1;
    if (lone && after !== 3) decimalAt = s.lastIndexOf(sep);
  }
  const intPart = decimalAt >= 0 ? s.slice(0, decimalAt) : s;
  const frac = decimalAt >= 0 ? s.slice(decimalAt + 1) : '';
  if (frac.length > 2 || (decimalAt >= 0 && frac.length === 0)) return null;
  const digits = intPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const minor = Number(digits) * 100 + Number(frac.padEnd(2, '0') || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}

export function convertMinor(minor: number, from: string, to: string, rates: Rates): number {
  if (from === to) return minor;
  const rf = rates.rates[from];
  const rt = rates.rates[to];
  if (!rf || !rt) throw new Error(`No rate for ${!rf ? from : to}`);
  return Math.round((minor / rf) * rt);
}

export function formatMoney(minor: number, currency: string, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency }).format(minor / 100);
}
