import { useRef, useState } from 'preact/hooks';
import type { ClaimDto, ItemDto } from '../../../shared/types';
import { ApiError, api } from '../../api';
import { ErrorState, Loading, Screen, errorText } from '../../components/Chrome';
import { Countdown } from '../../components/Countdown';
import { useAsync } from '../../hooks';
import { getLang, t } from '../../i18n';
import { money } from '../../money';
import { href } from '../../router';
import { showNotice } from '../../notice';
import { ask, haptic } from '../../tg';

interface Round { id: number; year: number; date: string; status: 'open' | 'revealed'; revealedAt: string | null }
interface Entry { item: ItemDto; claims: ClaimDto[] }
interface RevealData { round: Round; items: Entry[] }
interface Closed { nextRound: Round; thanked: number }

function Givers({ entry }: { entry: Entry }) {
  const { item, claims } = entry;
  const lang = getLang();
  if (item.groupFunding && item.currency && item.priceMinor != null) {
    const raised = claims.reduce((s, c) => s + (c.amountMinor ?? 0), 0);
    return (
      <>
        <p class="muted small">{t('fund.raised', { raised: money(raised, item.currency, lang), total: money(item.priceMinor, item.currency, lang) })}</p>
        <ul class="givers">{claims.map((c) => <li key={c.userId}>{`${c.name} · ${money(c.amountMinor ?? 0, item.currency!, lang)}`}</li>)}</ul>
      </>
    );
  }
  return <ul class="givers">{claims.map((c) => <li key={c.userId}>{c.name}</li>)}</ul>;
}

/** The one screen where the owner learns who reserved what: only on or after the birthday. */
export function Reveal() {
  const q = useAsync(() => api<RevealData>('/api/rounds/current/reveal'), []);
  const home = useAsync(() => (q.error?.code === 'too_early' ? api<{ date: string; daysLeft: number }>('/api/home') : Promise.resolve(null)), [q.error?.code]);
  const [received, setReceived] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Closed | null>(null);
  const inFlight = useRef(false);

  const toggle = (id: number) =>
    setReceived((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function close() {
    if (inFlight.current || !q.data) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!(await ask(t('reveal.confirm', { n: received.size })))) return;
      setClosed(await api<Closed>(`/api/rounds/${q.data.round.id}/close`, { method: 'POST', json: { receivedItemIds: [...received] } }));
      haptic('success');
    } catch (e) {
      haptic('error');
      showNotice(errorText(e instanceof ApiError ? e.code : 'unknown'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const title = t('reveal.title');
  if (closed) {
    const next = new Intl.DateTimeFormat(getLang() === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${closed.nextRound.date}T00:00:00Z`));
    return (
      <Screen title={title}>
        <div class="state">
          <p>{t('reveal.done', { n: closed.thanked })}</p>
          <p class="muted">{t('reveal.next', { date: next })}</p>
          <a class="btn" href={href.home()}>{t('reveal.back')}</a>
        </div>
      </Screen>
    );
  }
  if (q.error?.code === 'too_early') {
    return (
      <Screen title={title} back={href.home()}>
        <p class="muted center">{t('reveal.early')}</p>
        {home.data && <Countdown daysLeft={home.data.daysLeft} date={home.data.date} />}
      </Screen>
    );
  }
  if (q.error && !q.data) return <Screen title={title} back={href.home()}><ErrorState error={q.error} onRetry={q.reload} /></Screen>;
  if (!q.data) return <Screen title={title} back={href.home()}><Loading /></Screen>;

  return (
    <Screen title={title} back={href.home()}>
      {q.data.items.length === 0 && <p class="muted center">{t('reveal.empty')}</p>}
      <div class="rows">
        {q.data.items.map((entry) => (
          <div class="reveal-row" key={entry.item.id}>
            <b>{entry.item.title}</b>
            <Givers entry={entry} />
            <div class="check">
              <input id={`rcv-${entry.item.id}`} type="checkbox" checked={received.has(entry.item.id)} onChange={() => toggle(entry.item.id)} />
              <label for={`rcv-${entry.item.id}`}>{t('reveal.received')}</label>
            </div>
          </div>
        ))}
      </div>
      <div class="actions static pad">
        <button type="button" class="main" disabled={busy} onClick={() => void close()}>{t('reveal.close')}</button>
      </div>
    </Screen>
  );
}
