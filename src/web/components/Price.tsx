import { convertMinor } from '../../shared/money';
import type { ItemDto } from '../../shared/types';
import { getLang, t } from '../i18n';
import { money } from '../money';
import { useApp } from '../state';

/** The price as entered by the owner, plus the ≈ amount in the viewer's chosen currency. */
export function Price({ item, verbose = false }: { item: ItemDto; verbose?: boolean }) {
  const { currency, rates } = useApp();
  if (item.priceMinor == null || !item.currency) return null;
  const lang = getLang();
  let approx: string | null = null;
  if (item.currency !== currency && rates) {
    try {
      approx = money(convertMinor(item.priceMinor, item.currency, currency, rates), currency, lang);
    } catch {
      approx = null; // no rate for this pair: show only the original price
    }
  }
  return (
    <span class="price-block">
      <span class={verbose ? 'price' : 'price-sm'} data-testid="price">{money(item.priceMinor, item.currency, lang)}</span>
      {approx && (
        <span class="approx" data-testid="approx">{verbose ? t('item.approx', { amount: approx }) : `≈ ${approx}`}</span>
      )}
    </span>
  );
}
