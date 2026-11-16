import { afterEach, describe, expect, it } from 'vitest';
import { detectLang, getLang, setLang, t, tp } from '../../src/web/i18n';
import { en } from '../../src/web/i18n/en';
import { ru } from '../../src/web/i18n/ru';

afterEach(() => setLang('en'));

const placeholders = (v: string | readonly string[]) => [...new Set(([] as string[]).concat(v as string[]).flatMap((s) => s.match(/\{\w+\}/g) ?? []))].sort();

describe('catalogs', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });
  it('use the same {placeholders} in every key', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });
  it('have non-empty strings', () => {
    for (const cat of [en, ru]) for (const v of Object.values(cat)) for (const s of ([] as string[]).concat(v as string[])) expect(s.trim()).not.toBe('');
  });
});

describe('t', () => {
  it('substitutes parameters', () => {
    setLang('en');
    expect(t('home.all', { n: 17 })).toBe('All gifts · 17');
  });
  it('switches language', () => {
    setLang('ru');
    expect(getLang()).toBe('ru');
    expect(t('item.reserve')).toBe('Забронировать');
  });
  it('returns the key itself when it is unknown', () => {
    expect(t('no.such.key' as never)).toBe('no.such.key');
  });
});

describe('tp (plurals)', () => {
  it('handles Russian one/few/many', () => {
    setLang('ru');
    expect([1, 2, 5, 11, 21, 22, 25, 111, 0].map((n) => tp('days', n))).toEqual(['1 день', '2 дня', '5 дней', '11 дней', '21 день', '22 дня', '25 дней', '111 дней', '0 дней']);
  });
  it('handles English one/other', () => {
    setLang('en');
    expect([1, 2, 0].map((n) => tp('days', n))).toEqual(['1 day', '2 days', '0 days']);
  });
});

describe('detectLang', () => {
  it('maps ru to ru and everything else to en', () => {
    expect(detectLang('ru')).toBe('ru');
    expect(detectLang('uk')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
    expect(detectLang('en')).toBe('en');
  });
});
