import { InputFile, type Api } from 'grammy';
import type { Notifier } from '../deps';

/** Sends messages through the bot. Delivery problems (blocked bot, deleted account) are reported as false, never thrown. */
export class GrammyNotifier implements Notifier {
  constructor(private api: Api) {}

  async send(userId: number, html: string): Promise<boolean> {
    try {
      await this.api.sendMessage(userId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return true;
    } catch (err) {
      console.warn(`[notifier] message to ${userId} not delivered:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  async sendDocument(userId: number, path: string, caption: string): Promise<boolean> {
    try {
      await this.api.sendDocument(userId, new InputFile(path), { caption });
      return true;
    } catch (err) {
      console.warn(`[notifier] document to ${userId} not delivered:`, err instanceof Error ? err.message : err);
      return false;
    }
  }
}
