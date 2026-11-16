import type { MiddlewareHandler } from 'hono';
import { HttpError, type AppDeps, type AppEnv } from '../deps';
import { verifyInitData } from './initData';

export function authMiddleware(deps: Pick<AppDeps, 'config' | 'clock'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const match = /^tma (.+)$/.exec(header);
    const user = match ? verifyInitData(match[1]!, deps.config.botToken, deps.clock(), deps.config.initDataMaxAgeSec) : null;
    if (!user) throw new HttpError(401, 'unauthorized');
    c.set('viewer', { ...user, isOwner: user.id === deps.config.ownerId });
    await next();
  };
}
