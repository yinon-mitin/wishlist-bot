import type { ItemDto, Viewer } from '../shared/types';

export type ClaimState = { kind: 'hidden' } | { kind: 'free' } | { kind: 'mine' } | { kind: 'taken'; by: string };

/** What a viewer sees about a gift's reservation. The owner sees nothing: their DTOs carry no claims. */
export function claimState(item: ItemDto, viewer: Viewer): ClaimState {
  if (viewer.isOwner || !item.claims) return { kind: 'hidden' };
  const full = item.claims.find((c) => c.kind === 'full');
  if (!full) return { kind: 'free' };
  return full.mine ? { kind: 'mine' } : { kind: 'taken', by: full.name };
}
