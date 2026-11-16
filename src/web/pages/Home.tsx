import type { ItemDto } from '../../shared/types';
import { api } from '../api';
import { ErrorState, Loading, Screen } from '../components/Chrome';
import { OwnerBar } from '../components/OwnerBar';
import { ItemCard } from '../components/ItemCard';
import { useAsync } from '../hooks';
import { t } from '../i18n';
import { href } from '../router';

export function Home() {
  const q = useAsync(() => api<ItemDto[]>('/api/items'), []);
  const items = q.data ?? [];
  const must = items.filter((i) => i.priority === 'must').slice(0, 3);
  return (
    <Screen title={t('app.title')}>
      <OwnerBar />
      {q.error && !q.data && <ErrorState error={q.error} onRetry={q.reload} />}
      {!q.data && !q.error && <Loading />}
      {q.data && items.length === 0 && <p class="muted center">{t('home.empty')}</p>}
      {must.length > 0 && (
        <section>
          <h3 class="sec">{t('home.must')}</h3>
          <div class="rows">{must.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        </section>
      )}
      {items.length > 0 && <a class="main" href={href.list()}>{t('home.all', { n: items.length })}</a>}
    </Screen>
  );
}
