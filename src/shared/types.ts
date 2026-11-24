export type Lang = 'ru' | 'en';
export type Priority = 'must' | 'want' | 'nice';
export type ItemStatus = 'draft' | 'published' | 'received' | 'archived';
export type ClaimKind = 'full' | 'share';

export interface Viewer {
  id: number;
  name: string;
  lang: Lang;
  isOwner: boolean;
}

export interface ClaimDto {
  userId: number;
  name: string;
  kind: ClaimKind;
  amountMinor: number | null;
  mine: boolean;
}

export interface ItemDto {
  id: number;
  title: string;
  description: string;
  url: string | null;
  priceMinor: number | null;
  currency: string | null;
  imageUrl: string | null;
  category: string;
  priority: Priority;
  note: string;
  status: ItemStatus;
  groupFunding: boolean;
  /** Guests only. The owner's responses never contain this key. */
  claims?: ClaimDto[];
  /** Guests only. The owner's responses never contain this key. */
  funding?: { raisedMinor: number; remainingMinor: number };
}

export interface Rates {
  base: 'USD';
  rates: Record<string, number>;
  fetchedAt: string;
}
