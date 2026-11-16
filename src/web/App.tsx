import { useEffect, useState } from 'preact/hooks';
import type { Rates, Viewer } from '../shared/types';
import { api } from './api';
import { ErrorState, Loading } from './components/Chrome';
import { Notice } from './components/Notice';
import { useAsync } from './hooks';
import { setLang } from './i18n';
import { Home } from './pages/Home';
import { Item } from './pages/Item';
import { List } from './pages/List';
import { href, navigate, parseRoute, type Route } from './router';
import { ItemForm } from './pages/admin/ItemForm';
import { AppProvider, useApp, type AppConfig } from './state';
import { prefs } from './tg';

/** Subscribes to hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function Routes() {
  const route = useRoute();
  const { viewer } = useApp();
  const adminOnly = route.name.startsWith('admin-');
  useEffect(() => {
    if (adminOnly && !viewer.isOwner) navigate(href.home());
  }, [adminOnly, viewer.isOwner]);
  if (adminOnly && !viewer.isOwner) return <Home />;
  switch (route.name) {
    case 'admin-new':
      return <ItemForm />;
    case 'admin-edit':
      return <ItemForm key={route.id} id={route.id} />;
    case 'list':
      return <List />;
    case 'item':
      return <Item id={route.id} />;
    default:
      return <Home />;
  }
}

export function App() {
  const boot = useAsync(async () => {
    const [me, rates, saved] = await Promise.all([
      api<{ viewer: Viewer; config: AppConfig }>('/api/me'),
      api<Rates>('/api/rates').catch(() => null),
      prefs.get('currency'),
    ]);
    return { ...me, rates, saved };
  }, []);

  if (boot.error && !boot.data) return <div class="app"><ErrorState error={boot.error} onRetry={boot.reload} /></div>;
  if (!boot.data) return <div class="app"><Loading /></div>;
  const { viewer, config, rates, saved } = boot.data;
  setLang(viewer.lang);
  const initial = saved && config.currencies.includes(saved) ? saved : config.defaultCurrency;
  return (
    <AppProvider viewer={viewer} config={config} rates={rates} initialCurrency={initial}>
      <Routes />
      <Notice />
    </AppProvider>
  );
}
