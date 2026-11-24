import type { Config } from '../config';
import type { ClaimDto, ItemDto, Viewer } from '../../shared/types';
import type { ClaimRow, ItemRow } from './types';

/**
 * The single place where item responses are assembled. The owner's view never carries
 * claim or funding data (keys are absent, not empty).
 */
export function toItemDto(item: ItemRow, claims: ClaimRow[], viewer: Viewer, _config: Pick<Config, 'currencies'>): ItemDto {
  const dto: ItemDto = {
    id: item.id,
    title: item.title,
    description: item.description,
    url: item.url,
    priceMinor: item.price_minor,
    currency: item.currency,
    imageUrl: item.image_file ? `/images/${item.image_file}` : null,
    category: item.category,
    priority: item.priority,
    note: item.note,
    status: item.status,
    groupFunding: item.group_funding === 1,
  };
  if (viewer.isOwner) return dto;
  dto.claims = claims.map(
    (c): ClaimDto => ({ userId: c.user_id, name: c.user_name, kind: c.kind, amountMinor: c.amount_minor, mine: c.user_id === viewer.id }),
  );
  if (dto.groupFunding) {
    const raised = claims.filter((c) => c.kind === 'share').reduce((sum, c) => sum + (c.amount_minor ?? 0), 0);
    dto.funding = { raisedMinor: raised, remainingMinor: Math.max(0, (item.price_minor ?? 0) - raised) };
  }
  return dto;
}
