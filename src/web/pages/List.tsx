import { useState } from 'preact/hooks';
import type { ItemDto } from '../../shared/types';
import { api } from '../api';
import { claimState } from '../claims';
import { ErrorState, Loading, Screen } from '../components/Chrome';
import { OwnerBar } from '../components/OwnerBar';
import { ItemCard } from '../components/ItemCard';
import { useAsync } from '../hooks';
import { t } from '../i18n';
import { href } from '../router';
import { useApp } from '../state';

export function List({ archive = false }: { archive?: boolean }) {
  const { viewer } = useApp();
  const q = useAsync(() => api<ItemDto[]>(archive ? '/api/items?status=archive' : '/api/items'), [archive]);
  const [onlyFree, setOnlyFree] = useState(false);
  const items = (q.data ?? []).filter((i) => !onlyFree || claimState(i, viewer).kind === 'free');
  const categories = new Map<string, ItemDto[]>();
  for (const item of items) {
    const category = item.category || t('list.uncategorized');
    const grouped = categories.get(category) ?? [];
    grouped.push(item);
    categories.set(category, grouped);
  }
  return (
    <Screen title={archive ? t('list.archive') : t('list.title')} back={href.home()}>
      {!archive && <OwnerBar />}
      {!viewer.isOwner && (
        <div class="seg" role="group">
          <button type="button" class={onlyFree ? '' : 'on'} aria-pressed={!onlyFree} onClick={() => setOnlyFree(false)}>{t('list.all')}</button>
          <button type="button" class={onlyFree ? 'on' : ''} aria-pressed={onlyFree} onClick={() => setOnlyFree(true)}>{t('list.free')}</button>
        </div>
      )}
      {q.error && !q.data && <ErrorState error={q.error} onRetry={q.reload} />}
      {!q.data && !q.error && <Loading />}
      {q.data && (items.length ? [...categories].map(([category, grouped]) => (
        <section key={category}>
          <h3 class="sec">{category}</h3>
          <div class="rows">{grouped.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        </section>
      )) : <p class="muted center">{t('list.empty')}</p>)}
    </Screen>
  );
}
