import { useRef, useState } from 'preact/hooks';
import type { ItemDto } from '../../shared/types';
import { ApiError, api } from '../api';
import { claimState } from '../claims';
import { t } from '../i18n';
import { useApp } from '../state';
import { haptic } from '../tg';
import { errorText } from './Chrome';

interface Props {
  item: ItemDto;
  onItem: (next: ItemDto) => void;
  onStale: () => void;
}

/** Reserve / cancel my reservation. Ignores repeated presses while a request is in flight. */
export function ClaimButton({ item, onItem, onStale }: Props) {
  const { viewer } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const state = claimState(item, viewer);

  async function run(method: 'POST' | 'DELETE') {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      onItem(await api<ItemDto>(`/api/items/${item.id}/claim`, { method }));
      haptic('success');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      haptic('error');
      setMessage(errorText(code));
      if (code === 'already_claimed' || code === 'not_found') onStale();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (state.kind === 'hidden' || item.groupFunding) return null;
  return (
    <div class="actions">
      {message && <p class="msg" role="alert">{message}</p>}
      {state.kind === 'free' && <button type="button" class="main" disabled={busy} onClick={() => run('POST')}>{t('item.reserve')}</button>}
      {state.kind === 'mine' && <button type="button" class="main alt" disabled={busy} onClick={() => run('DELETE')}>{t('item.release')}</button>}
    </div>
  );
}
