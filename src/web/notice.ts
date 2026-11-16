type Listener = (message: string | null) => void;

let current: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();

export const currentNotice = (): string | null => current;
export const subscribeNotice = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** A short, soft message shown at the bottom of the screen. Disappears by itself. */
export function showNotice(message: string | null, ms = 4000): void {
  current = message;
  listeners.forEach((l) => l(message));
  clearTimeout(timer);
  if (message) timer = setTimeout(() => showNotice(null), ms);
}
