import { Api } from 'grammy';
import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/server/bot/bot';
import { GrammyNotifier } from '../../src/server/bot/notifier';
import { escapeHtml } from '../../src/server/util/html';

const TOKEN = '123456:TEST-TOKEN';
type Call = { method: string; payload: Record<string, any> };

const config = { botToken: TOKEN, publicUrl: 'https://wishlist.example.ts.net' } as never;

function recordingApi(reply: (method: string) => unknown = () => ({ ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } })) {
  const calls: Call[] = [];
  const transformer = async (_prev: unknown, method: string, payload: Record<string, any>) => {
    calls.push({ method, payload });
    return reply(method) as never;
  };
  return { calls, transformer };
}

const start = (lang?: string) => ({
  update_id: 1,
  message: {
    message_id: 1,
    date: 0,
    chat: { id: 5, type: 'private' as const, first_name: 'A' },
    from: { id: 5, is_bot: false, first_name: 'A', language_code: lang },
    text: '/start',
    entities: [{ type: 'bot_command' as const, offset: 0, length: 6 }],
  },
});

async function bot() {
  const b = createBot(config, { botInfo: { id: 1, is_bot: true, first_name: 'W', username: 'wishlist_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false } as never });
  const rec = recordingApi();
  b.api.config.use(rec.transformer as never);
  return { b, calls: rec.calls };
}

describe('bot /start', () => {
  it('answers a Russian user in Russian with a button that opens PUBLIC_URL as a web app', async () => {
    const { b, calls } = await bot();
    await b.handleUpdate(start('ru'));
    const send = calls.find((c) => c.method === 'sendMessage')!;
    expect(send.payload.text).toMatch(/[а-яА-Я]/);
    expect(send.payload.reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://wishlist.example.ts.net');
  });

  it('answers everyone else in English', async () => {
    const { b, calls } = await bot();
    for (const lang of ['en', 'uk', undefined]) {
      calls.length = 0;
      await b.handleUpdate(start(lang));
      expect(calls.find((c) => c.method === 'sendMessage')!.payload.text).not.toMatch(/[а-яА-Я]/);
    }
  });

  it('/help behaves like /start', async () => {
    const { b, calls } = await bot();
    await b.handleUpdate({ ...start('en'), message: { ...start('en').message, text: '/help' } } as never);
    expect(calls.some((c) => c.method === 'sendMessage')).toBe(true);
  });
});

describe('escapeHtml', () => {
  it('escapes the three HTML-significant characters', () => {
    expect(escapeHtml('<b>&"x"</b>')).toBe('&lt;b&gt;&amp;"x"&lt;/b&gt;');
  });
});

describe('GrammyNotifier', () => {
  it('sends HTML with link previews disabled and reports success', async () => {
    const rec = recordingApi();
    const api = new Api(TOKEN);
    api.config.use(rec.transformer as never);
    expect(await new GrammyNotifier(api).send(7, '<b>hi</b>')).toBe(true);
    expect(rec.calls[0]).toMatchObject({ method: 'sendMessage', payload: { chat_id: 7, text: '<b>hi</b>', parse_mode: 'HTML' } });
    expect(rec.calls[0]!.payload.link_preview_options).toEqual({ is_disabled: true });
  });

  it('returns false instead of throwing when the user blocked the bot', async () => {
    const rec = recordingApi(() => ({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }));
    const api = new Api(TOKEN);
    api.config.use(rec.transformer as never);
    expect(await new GrammyNotifier(api).send(7, 'x')).toBe(false);
  });

  it('returns false for a document that cannot be sent', async () => {
    const rec = recordingApi(() => ({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }));
    const api = new Api(TOKEN);
    api.config.use(rec.transformer as never);
    expect(await new GrammyNotifier(api).sendDocument(7, '/nonexistent/file.sqlite', 'cap')).toBe(false);
  });
});
