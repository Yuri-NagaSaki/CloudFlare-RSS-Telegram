import type { RuntimeConfig } from "../config";
import { sendMessage, sendPhoto, sendVideo, sendAudio, sendDocumentUrl, sendMediaGroup } from "./client";
import { splitHtml } from "../parsing/splitter";

export type SendOptions = {
  disableNotification: boolean;
  needMedia: boolean;
  needLinkPreview: boolean;
};

export const sendFormattedPost = async (
  config: RuntimeConfig,
  chatId: number,
  html: string,
  media: string[],
  options: SendOptions
): Promise<void> => {
  const disableNotification = options.disableNotification;
  const allowMedia = options.needMedia;
  const mediaToSend = allowMedia ? media : [];
  const hasMedia = mediaToSend.length > 0;
  const baseLimit = hasMedia ? 1024 : 4096;
  const chunks = html ? splitHtml(html, baseLimit) : [];
  const disablePreview = !options.needLinkPreview;

  if (!chunks.length && !mediaToSend.length) return;

  if (!mediaToSend.length) {
    for (const chunk of chunks) {
      await sendMessage(config, chatId, chunk, { disablePreview, disableNotification });
    }
    return;
  }

  const trimmedMedia = mediaToSend.slice(0, 10);
  const firstCaption = chunks.length > 0 && chunks[0].length <= 1024 ? chunks[0] : undefined;
  const remainingChunks = firstCaption ? chunks.slice(1) : chunks;

  const mediaGroup = buildMediaGroup(trimmedMedia, firstCaption);
  if (mediaGroup) {
    await sendMediaGroup(config, chatId, mediaGroup, disableNotification);
  } else {
    await sendSingleMedia(config, chatId, trimmedMedia[0], firstCaption, disableNotification);
  }

  for (const chunk of remainingChunks) {
    await sendMessage(config, chatId, chunk, { disablePreview, disableNotification });
  }
};

const buildMediaGroup = (
  media: string[],
  caption?: string
): Array<{ type: "photo" | "video"; media: string; caption?: string; parse_mode?: string }> | null => {
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
