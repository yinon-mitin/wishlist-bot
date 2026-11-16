import type { Config } from '../config';
import type { ItemDto, Viewer } from '../../shared/types';
import type { ClaimRow, ItemRow } from './types';

/**
 * The single place where item responses are assembled. The owner's view never carries
 * claim or funding data (keys are absent, not empty).
 */
export function toItemDto(item: ItemRow, _claims: ClaimRow[], _viewer: Viewer, _config: Pick<Config, 'currencies'>): ItemDto {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    url: item.url,
    priceMinor: item.price_minor,
    currency: item.currency,
    imageUrl: item.image_file ? `/images/${item.image_file}` : null,
    priority: item.priority,
    note: item.note,
    status: item.status,
    groupFunding: item.group_funding === 1,
  };
}
