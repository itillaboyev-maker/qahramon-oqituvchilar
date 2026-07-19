import type { TelegramClientPort } from "../../../application/ports/services/telegram-client.port";

export class TelegramClient implements TelegramClientPort {
  constructor(private readonly botToken: string) {}

  private get apiBase() {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  async isChannelMember(telegramUserId: number, channelId: string): Promise<boolean> {
    const res = await fetch(
      `${this.apiBase}/getChatMember?chat_id=${encodeURIComponent(channelId)}&user_id=${telegramUserId}`,
    );
    const data = (await res.json()) as { ok: boolean; result?: { status: string } };
    if (!data.ok || !data.result) return false;
    // "left" and "kicked" mean not a member; everything else (member/administrator/creator) counts.
    return !["left", "kicked"].includes(data.result.status);
  }

  async sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<void> {
    await fetch(`${this.apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...extra }),
    });
  }
}
