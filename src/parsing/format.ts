import * as crc32 from "crc-32";
import type { NormalizedEntry } from "../rss/feed";
import type { FeedRow, SubRow, UserRow } from "../db/queries";
import type { RuntimeConfig } from "../config";
import { parseEntry } from "./utils";
import { PostFormatter } from "./post_formatter";

export type EffectiveFormatting = {
  notify: number;
  send_mode: number;
  length_limit: number;
  link_preview: number;
  display_author: number;
  display_via: number;
  display_title: number;
  display_entry_tags: number;
  style: number;
  display_media: number;
  interval: number;
  tags: string[];
  titleOverride?: string | null;
};

export type FormattedPost = {
  html: string;
  media: string[];
  needMedia: boolean;
  needLinkPreview: boolean;
  title?: string;
  link?: string;
};

export const resolveFormatting = (sub: SubRow, user: UserRow, defaultInterval: number): EffectiveFormatting => {
  const resolve = (subValue: number, userValue: number) => (subValue === -100 ? userValue : subValue);
  const resolveMaybe = (subValue: number | null, userValue: number | null, fallback: number) =>
    subValue != null ? subValue : userValue != null ? userValue : fallback;

  return {
    notify: resolve(sub.notify, user.notify),
    send_mode: resolve(sub.send_mode, user.send_mode),
    length_limit: resolve(sub.length_limit, user.length_limit),
    link_preview: resolve(sub.link_preview, user.link_preview),
    display_author: resolve(sub.display_author, user.display_author),
    display_via: resolve(sub.display_via, user.display_via),
    display_title: resolve(sub.display_title, user.display_title),
    display_entry_tags: resolve(sub.display_entry_tags, user.display_entry_tags),
    style: resolve(sub.style, user.style),
    display_media: resolve(sub.display_media, user.display_media),
    interval: resolveMaybe(sub.interval, user.interval, defaultInterval),
    tags: parseTags(sub.tags),
    titleOverride: sub.title
  };
};

export const formatPost = async (
  entry: NormalizedEntry,
  feed: FeedRow,
  formatting: EffectiveFormatting,
  config: RuntimeConfig
): Promise<FormattedPost | null> => {
  const parsed = parseEntry(entry);
  const feedTitle = feed.title;
  const subTitle = formatting.titleOverride || feed.title;
  const formatter = new PostFormatter(
    parsed.content,
    parsed.title,
    feedTitle,
    parsed.link || feed.link,
    parsed.author,
    parsed.tags,
    feed.link,
    parsed.enclosures,
    config
  );

  const result = await formatter.getFormattedPost(
    subTitle,
    formatting.tags,
    formatting.send_mode,
    formatting.length_limit,
    formatting.link_preview,
    formatting.display_author,
    formatting.display_via,
    formatting.display_title,
    formatting.display_entry_tags,
    formatting.style,
    formatting.display_media
  );

  if (!result) return null;

  const [html, needMedia, needLinkPreview] = result;
  const media = formatter.media ? formatter.media.listUrls() : [];
  return {
    html,
    media,
    needMedia,
    needLinkPreview,
    title: parsed.title,
    link: parsed.link || feed.link
  };
};

export const generateEntryHash = (entry: NormalizedEntry): string => {
  const guid = entry.guid || entry.link || entry.title || entry.summary || entry.content || "";
  return toCrc32Hex(guid);
};

const toCrc32Hex = (value: string): string => {
  const hash = crc32.str(value);
  return (hash >>> 0).toString(16);
};

const parseTags = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\s#\uff0c,;\uff1b]+/g)
    .map((tag) => tag.trim())
    .filter(Boolean);
};
