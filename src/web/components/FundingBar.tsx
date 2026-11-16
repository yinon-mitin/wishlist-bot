import { convertMinor } from '../../shared/money';
import type { ItemDto } from '../../shared/types';
import { getLang, t } from '../i18n';
import { money } from '../money';
import { useApp } from '../state';

/** Amount of a gift's price shown in the viewer's currency when a rate exists, else in the gift's own. */
export function useInViewCurrency(item: ItemDto) {
  const { currency, rates } = useApp();
  const lang = getLang();
  return (minor: number): string => {
    const own = item.currency ?? currency;
    if (own !== currency && rates) {
      try {
        return money(convertMinor(minor, own, currency, rates), currency, lang);
      } catch {
        /* no rate: fall through */
      }
    }
    return money(minor, own, lang);
  };
}

/** Progress of a group-funded gift and who chipped in. Guests only: the owner's DTO has no funding data. */
export function FundingBar({ item }: { item: ItemDto }) {
  const { currency } = useApp();
  const view = useInViewCurrency(item);
  if (!item.funding || item.priceMinor == null || !item.currency) return null;
  const { raisedMinor, remainingMinor } = item.funding;
  const pct = Math.min(100, Math.round((raisedMinor / item.priceMinor) * 100));
  const own = (n: number) => money(n, item.currency!, getLang());
  const givers = (item.claims ?? []).filter((c) => c.kind === 'share');
  return (
    <section class="funding">
      <h3 class="sec flush">{t('fund.title')}</h3>
      <div class="fund" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
      <p>{t('fund.raised', { raised: view(raisedMinor), total: view(item.priceMinor) })}</p>
      {item.currency !== currency && <p class="muted small">{t('fund.raised', { raised: own(raisedMinor), total: own(item.priceMinor) })}</p>}
      <p class="muted">{remainingMinor > 0 ? t('fund.remaining', { amount: view(remainingMinor) }) : t('fund.done')}</p>
      {givers.length > 0 && <ul class="givers">{givers.map((g) => <li key={g.userId}>{`${g.name} · ${own(g.amountMinor ?? 0)}`}</li>)}</ul>}
    </section>
  );
}
