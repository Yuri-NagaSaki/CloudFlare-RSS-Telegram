import type { RuntimeConfig } from "../config";

export type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  text?: string;
};

const API_BASE = "https://api.telegram.org";

export const telegramFetch = async <T>(config: RuntimeConfig, method: string, payload?: Record<string, unknown>): Promise<T> => {
  const url = `${API_BASE}/bot${config.botToken}/${method}`;
  const maxRetries = 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0 && lastError) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });
    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`Telegram API ${method}: HTTP ${response.status}`);
      if (attempt < maxRetries) continue;
    }
    const data = (await response.json()) as TelegramResponse<T>;
    if (!data.ok) {
      throw new Error(data.description || `Telegram API error: ${method}`);
    }
    return data.result as T;
  }
  throw lastError!;
};

export const sendMessage = async (
  config: RuntimeConfig,
  chatId: number,
  text: string,
  options: { parseMode?: string; disablePreview?: boolean; replyMarkup?: unknown; disableNotification?: boolean } = {}
): Promise<TelegramMessage> => {
  return telegramFetch<TelegramMessage>(config, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode ?? "HTML",
    disable_web_page_preview: options.disablePreview ?? false,
    reply_markup: options.replyMarkup,
    disable_notification: options.disableNotification ?? false
  });
};

export const editMessageText = async (
  config: RuntimeConfig,
  chatId: number,
  messageId: number,
  text: string,
  options: { parseMode?: string; disablePreview?: boolean; replyMarkup?: unknown } = {}
): Promise<TelegramMessage> => {
  try {
    return await telegramFetch<TelegramMessage>(config, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parseMode ?? "HTML",
      disable_web_page_preview: options.disablePreview ?? false,
      reply_markup: options.replyMarkup
    });
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return { message_id: messageId, chat: { id: chatId }, text };
    }
    throw error;
  }
};

export const answerCallbackQuery = async (config: RuntimeConfig, callbackQueryId: string, text?: string, alert = false): Promise<void> => {
  await telegramFetch(config, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: alert
  });
};

export const answerInlineQuery = async (config: RuntimeConfig, inlineQueryId: string, results: unknown[]): Promise<void> => {
  await telegramFetch(config, "answerInlineQuery", {
    inline_query_id: inlineQueryId,
    results,
    cache_time: 3600
  });
};

export const sendPhoto = async (config: RuntimeConfig, chatId: number, photoUrl: string, caption?: string, disableNotification?: boolean): Promise<TelegramMessage> => {
  return telegramFetch<TelegramMessage>(config, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: caption ? "HTML" : undefined,
    disable_notification: disableNotification ?? false
  });
};

export const sendVideo = async (config: RuntimeConfig, chatId: number, videoUrl: string, caption?: string, disableNotification?: boolean): Promise<TelegramMessage> => {
  return telegramFetch<TelegramMessage>(config, "sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    caption,
    parse_mode: caption ? "HTML" : undefined,
    disable_notification: disableNotification ?? false
  });
};

export const sendAudio = async (config: RuntimeConfig, chatId: number, audioUrl: string, caption?: string, disableNotification?: boolean): Promise<TelegramMessage> => {
  return telegramFetch<TelegramMessage>(config, "sendAudio", {
    chat_id: chatId,
    audio: audioUrl,
    caption,
    parse_mode: caption ? "HTML" : undefined,
    disable_notification: disableNotification ?? false
  });
};

export const sendDocumentUrl = async (config: RuntimeConfig, chatId: number, docUrl: string, caption?: string, disableNotification?: boolean): Promise<TelegramMessage> => {
  return telegramFetch<TelegramMessage>(config, "sendDocument", {
    chat_id: chatId,
    document: docUrl,
    caption,
    parse_mode: caption ? "HTML" : undefined,
    disable_notification: disableNotification ?? false
  });
};

export const sendDocument = async (config: RuntimeConfig, chatId: number, content: string, filename: string): Promise<TelegramMessage> => {
  const url = `${API_BASE}/bot${config.botToken}/sendDocument`;
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([content], { type: "text/xml" }), filename);
  const response = await fetch(url, { method: "POST", body: form });
  const data = (await response.json()) as TelegramResponse<TelegramMessage>;
  if (!data.ok) throw new Error(data.description || "sendDocument failed");
  return data.result as TelegramMessage;
};

export const sendMediaGroup = async (
  config: RuntimeConfig,
  chatId: number,
  media: Array<{ type: "photo" | "video"; media: string; caption?: string; parse_mode?: string }>,
  disableNotification?: boolean
): Promise<TelegramMessage[]> => {
  return telegramFetch<TelegramMessage[]>(config, "sendMediaGroup", {
    chat_id: chatId,
    media,
    disable_notification: disableNotification ?? false
  });
};

export const getFile = async (config: RuntimeConfig, fileId: string): Promise<{ file_path: string }> => {
  return telegramFetch(config, "getFile", { file_id: fileId });
};

export const downloadFile = async (config: RuntimeConfig, filePath: string): Promise<ArrayBuffer> => {
  const url = `${API_BASE}/file/bot${config.botToken}/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to download file");
  return response.arrayBuffer();
};

const isMessageNotModifiedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /message is not modified/i.test(message);
};
