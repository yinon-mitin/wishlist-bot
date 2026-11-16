import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware';
import { HttpError, type AppDeps, type AppEnv } from '../deps';
import { errorHandler } from './errors';
import { itemsRoutes } from './routes/items';
import { meRoutes } from './routes/me';
import { ratesRoutes } from './routes/rates';
import { staticHandler } from './static';

export interface AppOptions {
  /** Directory with the built SPA (default: dist/web next to the working directory). */
  webRoot?: string;
  /** Hook for registering API routes (feature modules and tests). */
  extraRoutes?: (api: Hono<AppEnv>, deps: AppDeps) => void;
}

export function createApp(deps: AppDeps, opts: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);

  app.get('/healthz', (c) => c.json({ ok: true }));

  const api = new Hono<AppEnv>();
  api.use('*', authMiddleware(deps));
  api.route('/', meRoutes(deps));
  api.route('/', ratesRoutes(deps));
  api.route('/', itemsRoutes(deps));
  opts.extraRoutes?.(api, deps);
  api.all('*', () => {
    throw new HttpError(404, 'not_found');
  });
  app.route('/api', api);

  app.get('*', staticHandler(opts.webRoot ?? 'dist/web'));
  return app;
}
