// Importing the SDK runs Telegram's own script, which installs window.Telegram.WebApp. We read that object at call
// time: bundlers disagree about how to unwrap the package's CommonJS default export. The import must stay *used*,
// otherwise the bundler drops it as side-effect free and Telegram's script never runs (hence the fallback below).
import sdk from '@twa-dev/sdk';

type WebApp = typeof sdk;
const webApp = (): Partial<WebApp> | undefined =>
  (window as unknown as { Telegram?: { WebApp?: Partial<WebApp> } }).Telegram?.WebApp ?? (sdk as Partial<WebApp> | undefined);

/** Raw `initData` string for the Authorization header. Empty outside Telegram. */
export const initDataRaw = (): string => webApp()?.initData ?? '';

export const tgUser = () => webApp()?.initDataUnsafe?.user;
export const startParam = (): string | null => webApp()?.initDataUnsafe?.start_param ?? null;

export function initTelegram(): void {
  try {
    webApp()?.ready?.();
    webApp()?.expand?.();
  } catch {
    /* opened outside Telegram (dev) */
  }
}

export const haptic = (kind: 'success' | 'error' | 'light' = 'light'): void => {
  try {
    if (kind === 'light') webApp()?.HapticFeedback?.impactOccurred('light');
    else webApp()?.HapticFeedback?.notificationOccurred(kind);
  } catch {
    /* unsupported */
  }
};

/** Per-viewer preferences. Never throws: storage can be blocked. */
export const prefs = {
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(`wl:${key}`);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(`wl:${key}`, value);
    } catch {
      /* ignore */
    }
  },
};

export const openTelegramLink = (url: string): void => {
  try {
    const open = webApp()?.openTelegramLink;
    if (!open) throw new Error('unavailable');
    open.call(webApp(), url);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
};

/** Yes/no question: Telegram's native dialog when available, the browser's otherwise. */
export const ask = (message: string): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      const wa = webApp();
      if (wa?.isVersionAtLeast?.('6.2') && wa.showConfirm) {
        wa.showConfirm(message, (ok) => resolve(ok));
        return;
      }
    } catch {
      /* fall through */
    }
    resolve(window.confirm(message));
  });
