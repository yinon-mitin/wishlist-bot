import type { MiddlewareHandler } from 'hono';
import { HttpError, type AppEnv } from '../deps';

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('viewer').isOwner) throw new HttpError(403, 'forbidden');
  await next();
};
