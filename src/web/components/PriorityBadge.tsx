import type { Priority } from '../../shared/types';
import { t } from '../i18n';

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span class={`badge ${priority}`}>{t(`priority.${priority}`)}</span>;
}
