import { t } from '../i18n';
import { href } from '../router';
import { useApp } from '../state';

/** Owner-only shortcuts. Hiding it from guests is a convenience: the server enforces access. */
export function OwnerBar() {
  const { viewer } = useApp();
  if (!viewer.isOwner) return null;
  return (
    <nav class="ownerbar">
      <p class="muted">{t('owner.surprise')}</p>
      <a class="btn" href={href.adminNew()}>{t('owner.add')}</a>
      <a class="btn alt" href={href.adminReveal()}>{t('owner.reveal')}</a>
    </nav>
  );
}
