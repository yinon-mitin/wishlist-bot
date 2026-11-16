import type { ComponentChildren } from 'preact';
import { ApiError } from '../api';
import { t } from '../i18n';
import { useApp } from '../state';

function LangSwitch() {
  const { lang, switchLang } = useApp();
  return (
    <button type="button" class="lang" aria-label={t('common.language')} onClick={switchLang}>
      {lang === 'ru' ? 'EN' : 'RU'}
    </button>
  );
}

export function Bar({ title, back }: { title: string; back?: string }) {
  return (
    <header class="bar">
      {back ? <a class="bar-link" href={back}>{t('common.back')}</a> : <span />}
      <h1>{title}</h1>
      <LangSwitch />
    </header>
  );
}

export const errorText = (code: string): string =>
  code === 'already_claimed' ? t('item.error.already_claimed')
  : code === 'not_found' ? t('item.error.not_found')
  : code === 'network' ? t('item.error.network')
  : code === 'unauthorized' ? t('item.error.unauthorized')
  : t('item.error.generic');

export function Screen({ title, back, children }: { title: string; back?: string; children: ComponentChildren }) {
  return (
    <div class="app">
      <Bar title={title} back={back} />
      {children}
    </div>
  );
}

export function Loading() {
  return <p class="muted center">{t('common.loading')}</p>;
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <div class="state">
      <p>{errorText(error.code)}</p>
      <button type="button" class="btn" onClick={onRetry}>{t('common.retry')}</button>
    </div>
  );
}
