import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '../shared/currencies';

export interface Config {
  botToken: string;
  ownerId: number;
  publicUrl: string;
  birthday: string; // MM-DD
  timezone: string;
  currencies: string[];
  defaultCurrency: string;
  dataDir: string;
  port: number;
  botUsername?: string;
  appShortName?: string;
  backupKeep: number;
  backupHour: number;
  initDataMaxAgeSec: number;
}

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess(blankToUndefined, s.optional());

const schema = z.object({
  BOT_TOKEN: z.string({ error: 'is required' }).min(1, 'is required'),
  OWNER_ID: z.coerce.number({ error: 'is required' }).int().positive(),
  PUBLIC_URL: z
    .string({ error: 'is required' })
    .url()
    .refine((u) => u.startsWith('https://') || /^http:\/\/localhost(:\d+)?(\/|$)/.test(u), 'must be https (or http://localhost)')
    .transform((u) => u.replace(/\/+$/, '')),
  BIRTHDAY: z.string({ error: 'is required' }).regex(/^\d{2}-\d{2}$/, 'must look like MM-DD').refine((v) => {
    const [m, d] = v.split('-').map(Number) as [number, number];
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return days !== undefined && d >= 1 && d <= days;
  }, 'is not a real calendar date'),
  TIMEZONE: optional(z.string()).default('UTC'),
  CURRENCIES: optional(z.string()).default('RUB,ILS,USD,EUR'),
  DEFAULT_CURRENCY: optional(z.string()),
  DATA_DIR: optional(z.string()).default('./data'),
  PORT: optional(z.coerce.number().int().min(1).max(65535)).default(8080),
  BOT_USERNAME: optional(z.string()),
  APP_SHORT_NAME: optional(z.string()),
  BACKUP_KEEP: optional(z.coerce.number().int().min(1)).default(7),
  BACKUP_HOUR: optional(z.coerce.number().int().min(0).max(23)).default(3),
  INITDATA_MAX_AGE_SEC: optional(z.coerce.number().int().min(60)).default(86400),
});

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  const problems: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join('.')}: ${issue.message}`);
  }
  if (!parsed.success) throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  const e = parsed.data;

  try {
    new Intl.DateTimeFormat('en', { timeZone: e.TIMEZONE });
  } catch {
    problems.push(`TIMEZONE: unknown time zone "${e.TIMEZONE}"`);
  }
  const currencies = e.CURRENCIES.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  for (const c of currencies) {
    if (!SUPPORTED_CURRENCIES.includes(c)) problems.push(`CURRENCIES: ${c} is not supported (only 2-decimal currencies)`);
  }
  const defaultCurrency = (e.DEFAULT_CURRENCY ?? currencies[0] ?? '').toUpperCase();
  if (!currencies.includes(defaultCurrency)) problems.push(`DEFAULT_CURRENCY: ${defaultCurrency || '(empty)'} is not in CURRENCIES`);
  if (problems.length) throw new Error(`Invalid configuration:\n${problems.join('\n')}`);

  return {
    botToken: e.BOT_TOKEN,
    ownerId: e.OWNER_ID,
    publicUrl: e.PUBLIC_URL,
    birthday: e.BIRTHDAY,
    timezone: e.TIMEZONE,
    currencies,
    defaultCurrency,
    dataDir: e.DATA_DIR,
    port: e.PORT,
    botUsername: e.BOT_USERNAME,
    appShortName: e.APP_SHORT_NAME,
    backupKeep: e.BACKUP_KEEP,
    backupHour: e.BACKUP_HOUR,
    initDataMaxAgeSec: e.INITDATA_MAX_AGE_SEC,
  };
}
