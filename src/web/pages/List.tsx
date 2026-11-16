import { useState } from 'preact/hooks';
import type { ItemDto } from '../../shared/types';
import { api } from '../api';
import { claimState } from '../claims';
import { ErrorState, Loading, Screen } from '../components/Chrome';
import { ItemCard } from '../components/ItemCard';
import { useAsync } from '../hooks';
import { t } from '../i18n';
import { href } from '../router';
import { useApp } from '../state';

export function List() {
  const { viewer } = useApp();
  const q = useAsync(() => api<ItemDto[]>('/api/items'), []);
  const [onlyFree, setOnlyFree] = useState(false);
  const items = (q.data ?? []).filter((i) => !onlyFree || claimState(i, viewer).kind === 'free');
  return (
    <Screen title={t('list.title')} back={href.home()}>
      {!viewer.isOwner && (
        <div class="seg" role="group">
          <button type="button" class={onlyFree ? '' : 'on'} aria-pressed={!onlyFree} onClick={() => setOnlyFree(false)}>{t('list.all')}</button>
          <button type="button" class={onlyFree ? 'on' : ''} aria-pressed={onlyFree} onClick={() => setOnlyFree(true)}>{t('list.free')}</button>
        </div>
      )}
      {q.error && !q.data && <ErrorState error={q.error} onRetry={q.reload} />}
      {!q.data && !q.error && <Loading />}
      {q.data && (items.length ? <div class="rows">{items.map((i) => <ItemCard key={i.id} item={i} />)}</div> : <p class="muted center">{t('list.empty')}</p>)}
    </Screen>
  );
}
