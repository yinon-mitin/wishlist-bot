import { createHmac } from 'node:crypto';

export interface SignOpts {
  botToken: string;
  user: { id: number; first_name: string; last_name?: string; language_code?: string; username?: string };
  authDate: Date;
}

/** Builds a Telegram WebApp initData string signed the way Telegram does it. */
export function signInitData({ botToken, user, authDate }: SignOpts): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(authDate.getTime() / 1000)),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user),
  };
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
