import crc32 from "crc-32";
import { decode } from "he";
import type { NormalizedEntry } from "../rss/feed";
import type { FeedRow, SubRow, UserRow } from "../db/queries";

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
  linkPreview: boolean;
  sendAsTelegraph: boolean;
  sendAsLinkOnly: boolean;
  title?: string;
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

export const formatPost = (entry: NormalizedEntry, feed: FeedRow, formatting: EffectiveFormatting): FormattedPost => {
  const feedTitle = formatting.titleOverride || feed.title;
  const postTitle = entry.title || "Untitled";
  const link = entry.link || feed.link;
  const titleType = resolveTitleType(formatting.display_via, formatting.display_title, postTitle, feedTitle, link);
  const viaType = resolveViaType(formatting.display_via, feedTitle, link);
  const needAuthor = shouldDisplayAuthor(formatting.display_author, entry.author, feedTitle, viaType);
  const customTags = formatting.tags;
  const entryTags = entry.tags || [];
  const tags = customTags.concat(formatting.display_entry_tags === 1 ? entryTags : []);

  const contentRaw = entry.content || entry.summary || "";
  const { text: contentText, media } = extractContentAndMedia(contentRaw);

  const headerFooter = buildHeaderFooter({
    feedTitle,
    postTitle,
    link,
    tags,
    author: entry.author,
    titleType,
    viaType,
    needAuthor,
    style: formatting.style
  });

  const header = headerFooter.header;
  const footer = headerFooter.footer;
  const body = contentText ? escapeHtml(contentText) : "";
  const combined = [header, body, footer].filter(Boolean).join("\n\n");

  const linkPreview = formatting.link_preview === 1;
  const sendAsTelegraph = formatting.send_mode === 1;
  const sendAsLinkOnly = formatting.send_mode === -1;

  return {
    html: combined || escapeHtml(link || ""),
    media,
    linkPreview,
    sendAsTelegraph,
    sendAsLinkOnly,
    title: postTitle
  };
};

export const splitHtml = (html: string, maxLen: number): string[] => {
  if (html.length <= maxLen) return [html];
  const parts = html.split(/\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current}\n${part}` : part;
    if (candidate.length > maxLen) {
      if (current) chunks.push(current);
      if (part.length > maxLen) {
        for (let i = 0; i < part.length; i += maxLen) {
          chunks.push(part.slice(i, i + maxLen));
        }
        current = "";
      } else {
        current = part;
      }
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

export const generateEntryHash = (entry: NormalizedEntry): string => {
  const guid = entry.guid || entry.link || entry.title || entry.summary || entry.content || "";
  return toCrc32Hex(guid);
};

const toCrc32Hex = (value: string): string => {
  const hash = crc32.str(value);
  return (hash >>> 0).toString(16);
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

const parseTags = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\s#，,;；]+/g)
    .map((tag) => tag.trim())
    .filter(Boolean);
};

type ViaType = "none" | "feed_link" | "feed_text" | "text_link" | "bare_link";
type TitleType = "none" | "text" | "link";

const resolveViaType = (displayVia: number, feedTitle?: string, link?: string): ViaType => {
  if (displayVia === -2) return "none";
  if (displayVia === -4 && link) return "bare_link";
  if (displayVia === -1 && link) return "text_link";
  if (displayVia === -3) return "none";
  if (displayVia === 1 && feedTitle) return "feed_text";
  if (displayVia === 0 && feedTitle) return "feed_link";
  if (displayVia === 0 && !feedTitle && link) return "text_link";
  return "none";
};

const resolveTitleType = (displayVia: number, displayTitle: number, postTitle: string, feedTitle?: string, link?: string): TitleType => {
  if ((displayVia === 1 || displayVia === -3) && link) return "link";
  if (displayTitle === -1) return "none";
  if (displayTitle === 1) return "text";
  if (postTitle && (!feedTitle || postTitle !== feedTitle)) return "text";
  return "none";
};

const shouldDisplayAuthor = (display: number, author?: string, feedTitle?: string, viaType?: ViaType): boolean => {
  if (!author) return false;
  if (display === -1) return false;
  if (display === 1) return true;
  if (!feedTitle) return true;
  if (feedTitle.includes(author)) return false;
  if (viaType === "feed_link" || viaType === "feed_text") return !feedTitle.includes(author);
  return true;
};

const buildHeaderFooter = ({
  feedTitle,
  postTitle,
  link,
  tags,
  author,
  titleType,
  viaType,
  needAuthor,
  style
}: {
  feedTitle?: string;
  postTitle: string;
  link?: string;
  tags: string[];
  author?: string;
  titleType: TitleType;
  viaType: ViaType;
  needAuthor: boolean;
  style: number;
}): { header: string; footer: string } => {
  const safeFeedTitle = feedTitle ? escapeHtml(feedTitle) : "";
  const safePostTitle = escapeHtml(postTitle);
  const safeLink = link ? escapeHtml(link) : "";
  const tagsHtml = tags.length ? `#${tags.map((t) => escapeHtml(t)).join(" #")}` : "";
  const authorHtml = needAuthor && author ? `(author: ${escapeHtml(author)})` : "";

  const viaHtml = (() => {
    if (viaType === "feed_link" && safeFeedTitle && safeLink) return `via <a href=\"${safeLink}\">${safeFeedTitle}</a>`;
    if (viaType === "feed_text" && safeFeedTitle) return `via ${safeFeedTitle}`;
    if (viaType === "text_link" && safeLink) return `<a href=\"${safeLink}\">source</a>`;
    if (viaType === "bare_link" && safeLink) return safeLink;
    return "";
  })();

  const titleText = viaType === "feed_text" ? safeFeedTitle : safePostTitle;
  const titleHtml = (() => {
    if (titleType === "none" || !titleText) return "";
    const inner = titleType === "link" && safeLink ? `<a href=\"${safeLink}\">${titleText}</a>` : titleText;
    return `<b><u>${inner}</u></b>`;
  })();

  if (style === 1) {
    const feedHeader = viaType === "feed_link" || viaType === "feed_text" ? (safeFeedTitle ? `<b>${safeFeedTitle}</b>` : "") : "";
    const header = [feedHeader, titleHtml, tagsHtml].filter(Boolean).join("\n");
    const footer = [viaHtml, authorHtml].filter(Boolean).join("\n");
    return { header, footer };
  }

  const header = [titleHtml, tagsHtml].filter(Boolean).join("\n");
  const footer = [viaHtml, authorHtml].filter(Boolean).join(" ");
  return { header, footer };
};

const extractContentAndMedia = (html: string): { text: string; media: string[] } => {
  if (!html) return { text: "", media: [] };
  const media: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    media.push(imgMatch[1]);
  }
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "");
  const decoded = decode(cleaned);
  const text = decoded.replace(/\n{3,}/g, "\n\n").trim();
  return { text, media };
};
