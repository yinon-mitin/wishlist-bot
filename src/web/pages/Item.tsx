import type { ItemDto } from '../../shared/types';
import { api } from '../api';
import { ClaimButton } from '../components/ClaimButton';
import { ErrorState, Loading, Screen } from '../components/Chrome';
import { CurrencyPicker } from '../components/CurrencyPicker';
import { PriorityDot, Thumb } from '../components/ItemCard';
import { Price } from '../components/Price';
import { claimState } from '../claims';
import { useAsync } from '../hooks';
import { t } from '../i18n';
import { href } from '../router';
import { useApp } from '../state';

const isWebUrl = (u: string) => /^https?:\/\//i.test(u);

export function Item({ id }: { id: number }) {
  const { viewer } = useApp();
  const q = useAsync(() => api<ItemDto>(`/api/items/${id}`), [id]);
  const item = q.data;
  const state = item ? claimState(item, viewer) : null;
  return (
    <Screen title={t('item.title')} back={href.list()}>
      {q.error && !item && <ErrorState error={q.error} onRetry={q.reload} />}
      {!item && !q.error && <Loading />}
      {item && (
        <article class="item">
          <Thumb item={item} size="lg" />
          <div class="pad">
            <h2>{item.title}</h2>
            <Price item={item} verbose />
            <CurrencyPicker />
            {state?.kind === 'taken' && <p class="taken-by">{t('item.reserved.by', { name: state.by })}</p>}
            {item.description && <p class="desc">{item.description}</p>}
            <p class="meta"><PriorityDot priority={item.priority} />{t(`priority.${item.priority}`)}</p>
            {item.note && <p class="meta">{t('item.noteLabel')}: {item.note}</p>}
            {viewer.isOwner && <a class="link" href={href.adminEdit(item.id)}>{t('owner.edit')}</a>}
            {item.url && isWebUrl(item.url) && <a class="link" href={item.url} target="_blank" rel="noopener noreferrer">{t('item.openStore')}</a>}
          </div>
          <ClaimButton item={item} onItem={q.set} onStale={q.reload} />
        </article>
      )}
    </Screen>
  );
}
