import { useEffect, useState } from 'preact/hooks';
import { parseRoute, type Route } from './router';
import { t } from './i18n';

/** Subscribes to hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  return <main data-route={route.name}>{t('app.title')}</main>;
}
