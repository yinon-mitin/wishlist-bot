import { Bot, InlineKeyboard, type BotConfig, type Context } from 'grammy';
import type { Config } from '../config';
import type { Lang } from '../../shared/types';

const TEXT: Record<Lang, { welcome: string; open: string; menu: string }> = {
  ru: {
    welcome: 'Привет! Это вишлист на день рождения. Откройте его, чтобы посмотреть желания и забронировать подарок.',
    open: 'Открыть вишлист',
    menu: 'Вишлист',
  },
  en: {
    welcome: 'Hi! This is a birthday wishlist. Open it to see the wishes and reserve a gift.',
    open: 'Open wishlist',
    menu: 'Wishlist',
  },
};

export const langOf = (code: string | undefined): Lang => (code === 'ru' ? 'ru' : 'en');

export function createBot(config: Pick<Config, 'botToken' | 'publicUrl'>, botConfig?: BotConfig<Context>): Bot {
  const bot = new Bot(config.botToken, botConfig);

  const welcome = async (ctx: Context) => {
    const t = TEXT[langOf(ctx.from?.language_code)];
    await ctx.reply(t.welcome, { reply_markup: new InlineKeyboard().webApp(t.open, config.publicUrl) });
  };
  bot.command(['start', 'help'], welcome);

  bot.catch((err) => console.error('[bot] handler error:', err.error instanceof Error ? err.error.message : err.error));
  return bot;
}

/** One-time Telegram-side setup: the menu button opens the mini-app. Failures are logged, never fatal. */
export async function setupBot(bot: Bot, config: Pick<Config, 'publicUrl'>): Promise<void> {
  try {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: TEXT.en.menu, web_app: { url: config.publicUrl } } });
    await bot.api.setMyCommands([{ command: 'start', description: TEXT.en.open }], { language_code: undefined });
    await bot.api.setMyCommands([{ command: 'start', description: TEXT.ru.open }], { language_code: 'ru' });
  } catch (err) {
    console.warn('[bot] setup skipped:', err instanceof Error ? err.message : err);
  }
}
