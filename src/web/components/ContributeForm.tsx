import { useRef, useState } from 'preact/hooks';
import { convertMinor, toMinor } from '../../shared/money';
import type { ItemDto } from '../../shared/types';
import { ApiError, api } from '../api';
import { getLang, t } from '../i18n';
import { money } from '../money';
import { useApp } from '../state';
import { haptic } from '../tg';
import { errorText } from './Chrome';

interface Props {
  item: ItemDto;
  onItem: (next: ItemDto) => void;
  onStale: () => void;
}

/** Chip in (or change my share) in the gift's currency; take my share back. */
export function ContributeForm({ item, onItem, onStale }: Props) {
  const { currency, rates } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  if (!item.funding || !item.currency || item.priceMinor == null) return null;

  const lang = getLang();
  const cur = item.currency;
  const mine = (item.claims ?? []).find((c) => c.kind === 'share' && c.mine)?.amountMinor ?? 0;
  const max = item.funding.remainingMinor + mine;
  const parsed = text.trim() === '' ? null : toMinor(text);
  const valid = parsed != null && parsed > 0;
  const over = valid && parsed > max;

  let hint: string | null = null;
  if (valid && cur !== currency && rates) {
    try {
      hint = `≈ ${money(convertMinor(parsed, cur, currency, rates), currency, lang)}`;
    } catch {
      hint = null;
    }
  }

  async function run(method: 'POST' | 'DELETE') {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      onItem(await api<ItemDto>(`/api/items/${item.id}/contribute`, method === 'POST' ? { method, json: { amountMinor: parsed } } : { method }));
      setText('');
      haptic('success');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      haptic('error');
      setMessage(code === 'over_funded' ? t('item.error.over_funded') : errorText(code));
      if (code === 'over_funded' || code === 'already_claimed' || code === 'not_found') onStale();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div class="contribute">
      {mine > 0 && (
        <p class="mine">
          {t('fund.mine', { amount: money(mine, cur, lang) })}{' '}
          <button type="button" class="link plain" disabled={busy} onClick={() => void run('DELETE')}>{t('fund.withdraw')}</button>
        </p>
      )}
      {max > 0 && (
        <form onSubmit={(e) => { e.preventDefault(); if (valid && !over) void run('POST'); }}>
          <div class="field">
            <label for="contribute-amount">{t('fund.amount')}</label>
            <div class="inline">
              <input id="contribute-amount" inputMode="decimal" value={text} onInput={(e) => setText(e.currentTarget.value)} />
              <span class="cur">{cur}</span>
            </div>
          </div>
          {hint && <p class="muted small" data-testid="hint">{hint}</p>}
          {over && <p class="msg" role="alert">{t('fund.max', { amount: money(max, cur, lang) })}</p>}
          {message && <p class="msg" role="alert">{message}</p>}
          <button type="submit" class="main inline-main" disabled={busy || !valid || over}>{t('fund.contribute')}</button>
        </form>
      )}
    </div>
  );
}
