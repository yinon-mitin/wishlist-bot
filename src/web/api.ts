import { initDataRaw } from './tg';

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

interface Opts extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit | null;
}

/** Calls the backend with the Telegram initData as credentials. Failures are always ApiError. */
export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { json, body, headers, ...rest } = opts;
  const h: Record<string, string> = { Authorization: `tma ${initDataRaw()}`, ...(headers as Record<string, string> | undefined) };
  let payload: BodyInit | null | undefined = body;
  if (json !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...rest, headers: h, body: payload });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(res.status, typeof data?.error === 'string' ? data.error : `http_${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T;
}
