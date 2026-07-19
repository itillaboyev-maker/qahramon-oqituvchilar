export interface TelegramClientPort {
  isChannelMember(telegramUserId: number, channelId: string): Promise<boolean>;
  sendMessage(chatId: number, text: string, extra?: Record<string, unknown>): Promise<void>;
}
