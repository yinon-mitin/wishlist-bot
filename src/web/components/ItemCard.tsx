import type { ItemDto } from '../../shared/types';
import { claimState } from '../claims';
import { t } from '../i18n';
import { href } from '../router';
import { useApp } from '../state';
import { Price } from './Price';

export const hueOf = (id: number): number => (id * 47) % 360;

export function Thumb({ item, size = 'sm' }: { item: ItemDto; size?: 'sm' | 'lg' }) {
  return (
    <div class={`th ${size}`} style={{ background: `hsl(${hueOf(item.id)} 45% 48%)` }}>
      {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span class="ch" data-ch={item.title.slice(0, 1).toUpperCase()} />}
    </div>
  );
}

export function PriorityDot({ priority }: { priority: ItemDto['priority'] }) {
  return <span class={`dot ${priority}`} role="img" aria-label={t(`priority.${priority}`)} title={t(`priority.${priority}`)} />;
}

function Status({ item }: { item: ItemDto }) {
  const { viewer } = useApp();
  const s = claimState(item, viewer);
  if (s.kind === 'hidden') return null;
  if (item.groupFunding && s.kind === 'free' && item.funding && item.priceMinor) {
    return <span class="st free">{Math.min(100, Math.round((item.funding.raisedMinor / item.priceMinor) * 100))}%</span>;
  }
  if (s.kind === 'free') return <span class="st free">{t('item.status.free')}</span>;
  if (s.kind === 'mine') return <span class="st me">{t('item.status.mine')}</span>;
  return <span class="st taken">{s.by}</span>;
}

/** A list row: thumbnail, priority dot and title, price, reservation status. */
export function ItemCard({ item }: { item: ItemDto }) {
  return (
    <a class="row" href={href.item(item.id)}>
      <Thumb item={item} />
      <div class="t">
        <b><PriorityDot priority={item.priority} />{item.title}</b>
        <small><Price item={item} /></small>
      </div>
      <Status item={item} />
    </a>
  );
}
