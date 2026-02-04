import type { RuntimeConfig } from "../config";
import { sendMessage, sendPhoto, sendVideo, sendAudio, sendDocumentUrl, sendMediaGroup } from "./client";
import { createTelegraphPage } from "./telegraph";
import { splitHtml } from "../parsing/format";

export type SendOptions = {
  disableNotification: boolean;
  linkPreview: boolean;
  sendMode: number;
  lengthLimit: number;
  displayMedia: number;
};

export const sendFormattedPost = async (
  config: RuntimeConfig,
  chatId: number,
  html: string,
  title: string | undefined,
  link: string | undefined,
  media: string[],
  options: SendOptions
): Promise<void> => {
  const disableNotification = options.disableNotification;
  const sendMode = options.sendMode;
  const plainLength = stripHtml(html).length;
  const hasMedia = media.length > 0;
  const baseLimit = hasMedia ? 1024 : 4096;
  const lengthLimit = options.lengthLimit > 0 ? Math.min(options.lengthLimit, baseLimit) : baseLimit;

  if (sendMode === -1) {
    if (link) {
      await sendMessage(config, chatId, link, { disablePreview: false, disableNotification });
    }
    return;
  }

  const allowMedia = options.displayMedia !== -1;
  const onlyMedia = options.displayMedia === 1;
  const textToSend = onlyMedia ? "" : html;
  const tooLong = !onlyMedia && plainLength > lengthLimit;

  if (sendMode === 1 || (sendMode === 0 && tooLong)) {
    const telegraphUrl = await createTelegraphPage(config, title || "RSS", stripHtml(textToSend));
    if (telegraphUrl) {
      const text = title ? `<b>${escapeHtml(title)}</b>\n${telegraphUrl}` : telegraphUrl;
      await sendMessage(config, chatId, text, { disablePreview: !options.linkPreview, disableNotification });
      return;
    }
  }

  const chunks = splitHtml(textToSend, 4096);
  const trimmedMedia = allowMedia ? media.slice(0, 10) : [];

  if (trimmedMedia.length === 0 || onlyMedia) {
    if (onlyMedia) {
      if (trimmedMedia.length === 0) return;
    }
    for (const chunk of chunks) {
      await sendMessage(config, chatId, chunk, {
        disablePreview: !options.linkPreview,
        disableNotification
      });
    }
    return;
  }

  const firstCaption = chunks.length > 0 && chunks[0].length <= 1024 ? chunks[0] : undefined;
  const remainingChunks = firstCaption ? chunks.slice(1) : chunks;

  const mediaGroup = buildMediaGroup(trimmedMedia, firstCaption);
  if (mediaGroup) {
    await sendMediaGroup(config, chatId, mediaGroup, disableNotification);
  } else {
    await sendSingleMedia(config, chatId, trimmedMedia[0], firstCaption, disableNotification);
  }

  for (const chunk of remainingChunks) {
    await sendMessage(config, chatId, chunk, { disablePreview: !options.linkPreview, disableNotification });
  }
};

const buildMediaGroup = (media: string[], caption?: string): Array<{ type: "photo" | "video"; media: string; caption?: string; parse_mode?: string }> | null => {
  const group: Array<{ type: "photo" | "video"; media: string; caption?: string; parse_mode?: string }> = [];
  for (let i = 0; i < media.length; i += 1) {
    const url = media[i];
    const type = guessMediaType(url);
    if (type !== "photo" && type !== "video") return null;
    group.push({ type, media: url });
  }
  if (group.length === 0) return null;
  if (caption) {
    group[0].caption = caption;
    group[0].parse_mode = "HTML";
  }
  return group;
};

const sendSingleMedia = async (
  config: RuntimeConfig,
  chatId: number,
  url: string,
  caption: string | undefined,
  disableNotification: boolean
): Promise<void> => {
  const type = guessMediaType(url);
  if (type === "video") {
    await sendVideo(config, chatId, url, caption, disableNotification);
  } else if (type === "audio") {
    await sendAudio(config, chatId, url, caption, disableNotification);
  } else if (type === "document") {
    await sendDocumentUrl(config, chatId, url, caption, disableNotification);
  } else {
    await sendPhoto(config, chatId, url, caption, disableNotification);
  }
};

const guessMediaType = (url: string): "photo" | "video" | "audio" | "document" => {
  const lower = url.toLowerCase();
  if (lower.match(/\.(mp4|webm|mov)(\?|$)/)) return "video";
  if (lower.match(/\.(mp3|m4a|ogg|aac)(\?|$)/)) return "audio";
  if (lower.match(/\.(pdf|zip|rar|7z)(\?|$)/)) return "document";
  return "photo";
};

const escapeHtml = (value: string): string => {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

const stripHtml = (value: string): string => {
  return value.replace(/<[^>]+>/g, "");
};
