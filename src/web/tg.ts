import WebApp from '@twa-dev/sdk';

/** Raw `initData` string for the Authorization header. */
export const initDataRaw = (): string => WebApp.initData;

export const tgUser = () => WebApp.initDataUnsafe?.user;
export const startParam = (): string | null => WebApp.initDataUnsafe?.start_param ?? null;

export function initTelegram(): void {
  try {
    WebApp.ready();
    WebApp.expand();
  } catch {
    /* opened outside Telegram (dev) */
  }
}

export const haptic = (kind: 'success' | 'error' | 'light' = 'light'): void => {
  try {
    if (kind === 'light') WebApp.HapticFeedback.impactOccurred('light');
    else WebApp.HapticFeedback.notificationOccurred(kind);
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

/** Yes/no question: Telegram's native dialog when available, the browser's otherwise. */
export const ask = (message: string): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      if (WebApp.isVersionAtLeast('6.2')) {
        WebApp.showConfirm(message, (ok) => resolve(ok));
        return;
      }
    } catch {
      /* fall through */
    }
    resolve(window.confirm(message));
  });
