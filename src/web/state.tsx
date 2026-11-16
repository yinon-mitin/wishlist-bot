import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useState } from 'preact/hooks';
import type { Rates, Viewer } from '../shared/types';
import { prefs } from './tg';

export interface AppConfig {
  currencies: string[];
  defaultCurrency: string;
  birthday: string;
  botUsername: string | null;
  appShortName: string | null;
}

export interface AppState {
  viewer: Viewer;
  config: AppConfig;
  rates: Rates | null;
  currency: string;
  setCurrency: (code: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

interface ProviderProps {
  viewer: Viewer;
  config: AppConfig;
  rates: Rates | null;
  initialCurrency: string;
  children: ComponentChildren;
}

/** Holds what every screen needs: who is looking, server config, exchange rates, the chosen display currency. */
export function AppProvider({ viewer, config, rates, initialCurrency, children }: ProviderProps) {
  const [currency, setCurrencyState] = useState(initialCurrency);
  const setCurrency = useCallback((code: string) => {
    setCurrencyState(code);
    void prefs.set('currency', code);
  }, []);
  return <Ctx.Provider value={{ viewer, config, rates, currency, setCurrency }}>{children}</Ctx.Provider>;
}
