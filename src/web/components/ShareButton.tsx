import type { ItemDto } from '../../shared/types';
import { buildItemLink, buildShareUrl } from '../../shared/deeplink';
import { t } from '../i18n';
import { useApp } from '../state';
import { openTelegramLink } from '../tg';

/** Opens Telegram's share dialog with a link to this gift. The text is only the title: no reservation info. */
export function ShareButton({ item }: { item: ItemDto }) {
  const { config } = useApp();
  const link = buildItemLink(config, item.id);
  if (!link) return null;
  return <button type="button" class="link plain" onClick={() => openTelegramLink(buildShareUrl(link, item.title))}>{t('common.share')}</button>;
}
