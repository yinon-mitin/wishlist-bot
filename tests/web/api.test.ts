import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/web/tg', () => ({ initDataRaw: () => 'RAW-INIT-DATA' }));
import { ApiError, api } from '../../src/web/api';

afterEach(() => vi.unstubAllGlobals());

const stub = (res: Response | Error) => {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

describe('api', () => {
  it('sends the Telegram initData as the Authorization header', async () => {
    const f = stub(Response.json({ ok: 1 }));
    expect(await api('/api/me')).toEqual({ ok: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/me');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('tma RAW-INIT-DATA');
  });

  it('sends JSON bodies with the right content type and method', async () => {
    const f = stub(Response.json({}));
    await api('/api/items/1/claim', { method: 'POST', json: { a: 1 } });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns an error payload into ApiError with status and code', async () => {
    stub(Response.json({ error: 'already_claimed' }, { status: 409 }));
    await expect(api('/api/items/1/claim', { method: 'POST' })).rejects.toMatchObject({ name: 'ApiError', status: 409, code: 'already_claimed' });
  });

  it('uses a generic code when the error body is not JSON', async () => {
    stub(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(api('/api/me')).rejects.toMatchObject({ status: 502, code: 'http_502' });
  });

  it('reports a network failure as ApiError with code network', async () => {
    stub(new TypeError('Failed to fetch'));
    const err = await api('/api/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'network' });
  });

  it('does not set a JSON content type for FormData bodies', async () => {
    const f = stub(Response.json({}));
    await api('/api/items/1/image', { method: 'POST', body: new FormData() });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});
