import { useEffect, useState } from 'preact/hooks';
import type { ItemDto } from '../../shared/types';
import { api } from '../api';
import { ClaimButton } from '../components/ClaimButton';
import { ContributeForm } from '../components/ContributeForm';
import { FundingBar } from '../components/FundingBar';
import { ErrorState, Loading, Screen } from '../components/Chrome';
import { CurrencyPicker } from '../components/CurrencyPicker';
import { Thumb } from '../components/ItemCard';
import { PriorityBadge } from '../components/PriorityBadge';
import { ShareButton } from '../components/ShareButton';
import { Price } from '../components/Price';
import { claimState } from '../claims';
import { useAsync } from '../hooks';
import { t } from '../i18n';
import { showNotice } from '../notice';
import { href, navigate } from '../router';
import { useApp } from '../state';
import { ask } from '../tg';

const isWebUrl = (u: string) => /^https?:\/\//i.test(u);

export function Item({ id }: { id: number }) {
  const { viewer } = useApp();
  const q = useAsync(() => api<ItemDto>(`/api/items/${id}`), [id]);
  const item = q.data;
  const state = item ? claimState(item, viewer) : null;
  const [publishing, setPublishing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // A link to a gift that does not exist (or is still a draft) lands on the home screen with a notice.
  useEffect(() => {
    if (!item && q.error?.code === 'not_found') {
      showNotice(t('item.error.not_found'));
      navigate(href.home());
    }
  }, [item, q.error]);

  async function publish() {
    if (!item || publishing) return;
    setPublishing(true);
    try {
      q.set(await api<ItemDto>(`/api/items/${item.id}/publish`, { method: 'POST' }));
    } catch {
      showNotice(t('item.error.generic'));
    } finally {
      setPublishing(false);
    }
  }
  async function changeStatus(kind: 'received' | 'archive' | 'restore') {
    if (!item || changingStatus) return;
    if (kind !== 'restore' && !(await ask(kind === 'received' ? t('owner.receivedConfirm') : t('owner.archiveConfirm')))) return;
    setChangingStatus(true);
    try {
      await api<ItemDto>(`/api/items/${item.id}/${kind}`, { method: 'POST' });
      navigate(href.list());
    } catch {
      showNotice(t('item.error.generic'));
    } finally {
      setChangingStatus(false);
    }
  }
  return (
    <Screen title={t('item.title')} back={item && (item.status === 'received' || item.status === 'archived') ? href.archive() : href.list()}>
      {q.error && q.error.code !== 'not_found' && !item && <ErrorState error={q.error} onRetry={q.reload} />}
      {!item && (!q.error || q.error.code === 'not_found') && <Loading />}
      {item && (
        <article class="item">
          <Thumb item={item} size="lg" />
          <div class="pad">
            <h2>{item.title}</h2>
            <Price item={item} verbose />
            <CurrencyPicker />
            {state?.kind === 'taken' && <p class="taken-by">{t('item.reserved.by', { name: state.by })}</p>}
            {item.description && <p class="desc">{item.description}</p>}
            <p class="meta">
              <PriorityBadge priority={item.priority} />
              {item.category && <span class="badge">{item.category}</span>}
              {item.status === 'draft' && <span class="badge draft">{t('owner.draftTag')}</span>}
              {item.status === 'received' && <span class="badge">{t('owner.receivedTag')}</span>}
              {item.status === 'archived' && <span class="badge">{t('owner.boughtTag')}</span>}
            </p>
            {item.note && <p class="note"><span class="muted">{t('item.noteLabel')}: </span>{item.note}</p>}
            <div class="links">
              {viewer.isOwner && <a class="link" href={href.adminEdit(item.id)}>{t('owner.edit')}</a>}
              <ShareButton item={item} />
            </div>
            {item.url && isWebUrl(item.url) && <a class="link" href={item.url} target="_blank" rel="noopener noreferrer">{t('item.openStore')}</a>}
          </div>
          {item.groupFunding && !viewer.isOwner && (
            <div class="pad">
              <FundingBar item={item} />
              <ContributeForm item={item} onItem={q.set} onStale={q.reload} />
            </div>
          )}
          <ClaimButton item={item} onItem={q.set} onStale={q.reload} />
          {viewer.isOwner && item.status === 'draft' && (
            <div class="actions"><button type="button" class="main" disabled={publishing} onClick={() => void publish()}>{t('owner.publish')}</button></div>
          )}
          {viewer.isOwner && item.status === 'published' && (
            <div class="actions static">
              <button type="button" class="main alt" disabled={changingStatus} onClick={() => void changeStatus('archive')}>{t('owner.bought')}</button>
              <button type="button" class="main" disabled={changingStatus} onClick={() => void changeStatus('received')}>{t('owner.received')}</button>
            </div>
          )}
          {viewer.isOwner && (item.status === 'received' || item.status === 'archived') && (
            <div class="actions static"><button type="button" class="main alt" disabled={changingStatus} onClick={() => void changeStatus('restore')}>{t('owner.restore')}</button></div>
          )}
        </article>
      )}
    </Screen>
  );
}
