import type { ClaimKind, ItemStatus, Lang, Priority } from '../../shared/types';

export interface ItemRow {
  id: number;
  title: string;
  description: string;
  url: string | null;
  price_minor: number | null;
  currency: string | null;
  image_file: string | null;
  priority: Priority;
  note: string;
  status: ItemStatus;
  group_funding: number;
  created_at: string;
  updated_at: string;
}

export interface ClaimRow {
  id: number;
  item_id: number;
  round_id: number;
  user_id: number;
  user_name: string;
  kind: ClaimKind;
  amount_minor: number | null;
  lang: Lang;
  created_at: string;
}
