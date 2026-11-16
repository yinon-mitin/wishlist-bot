import { getLang, t, tp } from '../i18n';

/** Days until the birthday. `daysLeft` is never negative: the server holds it at 0 until the round is closed. */
export function Countdown({ daysLeft, date }: { daysLeft: number; date: string }) {
  if (daysLeft <= 0) return <div class="count today"><b>{t('home.today')}</b></div>;
  const pretty = new Intl.DateTimeFormat(getLang() === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  return (
    <div class="count">
      <b>{tp('days', daysLeft)}</b>
      <span>{t('home.countdown', { date: pretty })}</span>
    </div>
  );
}
