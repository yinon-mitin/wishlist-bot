import type { ErrorHandler } from 'hono';
import { HttpError } from '../deps';

/** Maps HttpError to { error: code }; anything else becomes a generic 500 with no details. */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.code }, err.status as 400);
  console.error('[error]', err);
  return c.json({ error: 'internal' }, 500);
};
