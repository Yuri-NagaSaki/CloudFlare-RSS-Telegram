import type { RuntimeConfig } from "../config";
import { parse } from "./html_parser";
import { HtmlTree, Text, Bold, Underline, Link } from "./html_node";
import { Media, AbstractMedium, Image, Video, Audio, File, Animation, constructWeservUrlConvertTo2560 } from "./medium";
import { stripAnySpace, escapeHashtags, mergeTags, isAbsoluteHttpLink } from "./utils";
import { getPlainTextLength } from "./splitter";
import { telegraphIfy } from "./tgraph";

export const AUTO = 0;
export const DISABLE = -1;
export const FORCE_DISPLAY = 1;
export const FORCE_ENABLE = 1;
export const FORCE_LINK = -1;
export const FORCE_TELEGRAPH = 1;
export const FORCE_MESSAGE = 2;
export const FEED_TITLE_AND_LINK = 0;
export const FEED_TITLE_AND_LINK_AS_POST_TITLE = 1;
export const NO_FEED_TITLE_BUT_LINK_AS_POST_TITLE = -3;
export const NO_FEED_TITLE_BUT_TEXT_LINK = -1;
export const NO_FEED_TITLE_BUT_BARE_LINK = -4;
export const COMPLETELY_DISABLE = -2;
export const ONLY_MEDIA_NO_CONTENT = 1;
export const RSSTT = 0;
export const FLOWERSS = 1;

export const NO_VIA = "no_via";
export const FEED_TITLE_VIA_NO_LINK = "feed_title_via_no_link";
export const FEED_TITLE_VIA_W_LINK = "feed_title_via_w_link";
export const TEXT_LINK_VIA = "text_link_via";
export const BARE_LINK_VIA = "bare_link_via";
export type TypeViaType =
  | typeof NO_VIA
  | typeof FEED_TITLE_VIA_NO_LINK
  | typeof FEED_TITLE_VIA_W_LINK
  | typeof TEXT_LINK_VIA
  | typeof BARE_LINK_VIA;

export const NORMAL_MESSAGE = "normal_message";
export const TELEGRAPH_MESSAGE = "telegraph_message";
export const LINK_MESSAGE = "link_message";
export type TypeMessageType = typeof NORMAL_MESSAGE | typeof TELEGRAPH_MESSAGE | typeof LINK_MESSAGE;

export const NORMAL_STYLE = "normal_style";
export const FLOWERSS_STYLE = "flowerss_style";
export type TypeMessageStyle = typeof NORMAL_STYLE | typeof FLOWERSS_STYLE;

export const POST_TITLE_NO_LINK = "post_title_no_link";
export const POST_TITLE_W_LINK = "post_title_w_link";
export const NO_POST_TITLE = "no_post_title";
export type TypePostTitleType = typeof POST_TITLE_NO_LINK | typeof POST_TITLE_W_LINK | typeof NO_POST_TITLE;

export type Enclosure = {
  url: string;
  length?: number | null;
  type?: string;
  duration?: string | null;
  thumbnail?: string | null;
};

export class PostFormatter {
  html: string;
  title?: string;
  feedTitle?: string;
  link?: string;
  author?: string;
  tags?: Array<string>;
  feedLink?: string;
  enclosures?: Array<Enclosure>;
  config: RuntimeConfig;

  parsed = false;
  htmlTree: HtmlTree | null = null;
  media: Media | null = null;
  enclosureMediums: Array<AbstractMedium> | null = null;
  parsedHtml: string | null = null;
  plainLength: number | null = null;
  telegraphLink: string | false | null = null;
  tagsEscaped: Array<string> | null = null;
  private titleSimilarity: number | null = null;
  private parsePromise: Promise<void> | null = null;
  private telegraphPromise: Promise<string | false> | null = null;

  private postBucket = new Map<string, [string, boolean, boolean] | null>();
  private paramToOptionCache = new Map<string, string>();

  constructor(
    html: string,
    title: string | undefined,
    feedTitle: string | undefined,
    link: string | undefined,
    author: string | undefined,
    tags: Array<string> | undefined,
    feedLink: string | undefined,
    enclosures: Array<Enclosure> | undefined,
    config: RuntimeConfig
  ) {
    this.html = html || "";
    this.title = title || undefined;
    this.feedTitle = feedTitle || undefined;
    this.link = link || undefined;
    this.author = author || undefined;
    this.tags = tags || undefined;
    this.feedLink = feedLink || undefined;
    this.enclosures = enclosures || undefined;
    this.config = config;
  }

  async getFormattedPost(
    subTitle: string | undefined,
    tags: Array<string> | undefined,
    sendMode: number,
    lengthLimit: number,
    linkPreview: number,
    displayAuthor: number,
    displayVia: number,
    displayTitle: number,
    displayEntryTags: number,
    style: number,
    displayMedia: number
  ): Promise<[string, boolean, boolean] | null> {
    subTitle = subTitle || this.feedTitle;
    tags = tags || [];

    const paramHash = [
      subTitle,
      tags.join(","),
      sendMode,
      lengthLimit,
      linkPreview,
      displayAuthor,
      displayVia,
      displayTitle,
      displayEntryTags,
      displayMedia,
      style
    ].join("|");

    const cachedOption = this.paramToOptionCache.get(paramHash);
    if (cachedOption && this.postBucket.has(cachedOption)) {
      return this.postBucket.get(cachedOption) || null;
    }

    if (!this.parsed) {
      await this.parseHtml();
    }

    let viaType: TypeViaType;
    if (displayVia === COMPLETELY_DISABLE || !(subTitle || this.link)) viaType = NO_VIA;
    else if (displayVia === NO_FEED_TITLE_BUT_BARE_LINK && this.link) viaType = BARE_LINK_VIA;
    else if (displayVia === NO_FEED_TITLE_BUT_TEXT_LINK && this.link) viaType = TEXT_LINK_VIA;
    else if (displayVia === FEED_TITLE_AND_LINK_AS_POST_TITLE && subTitle) viaType = FEED_TITLE_VIA_NO_LINK;
    else if (displayVia === NO_FEED_TITLE_BUT_LINK_AS_POST_TITLE) viaType = NO_VIA;
    else if (displayVia === FEED_TITLE_AND_LINK && subTitle) viaType = FEED_TITLE_VIA_W_LINK;
    else if (displayVia === FEED_TITLE_AND_LINK && !subTitle && this.link) viaType = TEXT_LINK_VIA;
    else viaType = NO_VIA;

    if (this.title && this.titleSimilarity === null && displayTitle === AUTO && this.htmlTree) {
      const plainText = stripAnySpace(this.htmlTree.getHtml(true));
      let titleTbc = this.title
        .replace("[图片]", "")
        .replace("[视频]", "")
        .replace("发布了: ", "")
        .trim()
        .replace(/[.…]+$/g, "");
      titleTbc = stripAnySpace(titleTbc);
      const sample = plainText.slice(0, this.title.length + 10);
      this.titleSimilarity = partialRatio(titleTbc, sample);
    }

    let titleType: TypePostTitleType;
    if ((displayVia === FEED_TITLE_AND_LINK_AS_POST_TITLE || displayVia === NO_FEED_TITLE_BUT_LINK_AS_POST_TITLE) && this.link) {
      titleType = POST_TITLE_W_LINK;
    } else if (
      displayTitle !== DISABLE &&
      this.title &&
      (displayTitle === FORCE_DISPLAY || (displayTitle === AUTO && (this.titleSimilarity ?? 0) < 90))
    ) {
      titleType = POST_TITLE_NO_LINK;
    } else {
      titleType = NO_POST_TITLE;
    }

    const needAuthor = Boolean(
      displayAuthor !== DISABLE &&
        this.author &&
        (displayAuthor === FORCE_DISPLAY ||
          (displayAuthor === AUTO &&
            ((!subTitle || !this.author || !subTitle.includes(this.author)) ||
              (viaType !== FEED_TITLE_VIA_NO_LINK && viaType !== FEED_TITLE_VIA_W_LINK))))
    );

    if (displayEntryTags === FORCE_DISPLAY) {
      if (!this.tagsEscaped) this.tagsEscaped = escapeHashtags(this.tags || []);
      if (this.tagsEscaped.length) tags = mergeTags(tags, this.tagsEscaped);
    }

    const messageStyle = style === FLOWERSS ? FLOWERSS_STYLE : NORMAL_STYLE;

    let messageType: TypeMessageType;
    let normalMsgPost: string | null = null;
    if (sendMode === FORCE_MESSAGE) messageType = NORMAL_MESSAGE;
    else if (sendMode === FORCE_LINK && this.link) messageType = LINK_MESSAGE;
    else if (sendMode === FORCE_TELEGRAPH && this.telegraphLink !== false) messageType = TELEGRAPH_MESSAGE;
    else if (sendMode === FORCE_TELEGRAPH && this.telegraphLink === false) {
      if (this.link) {
        messageType = LINK_MESSAGE;
        titleType = POST_TITLE_W_LINK;
      } else {
        messageType = NORMAL_MESSAGE;
      }
    } else {
      const mediaMsgCount = displayMedia !== DISABLE && this.media ? this.media.estimateMessageCounts() : 0;
      normalMsgPost = this.generateFormattedPost(subTitle, tags, titleType, viaType, Boolean(needAuthor), NORMAL_MESSAGE, messageStyle);
      const normalMsgLen = getPlainTextLength(normalMsgPost);
      if (
        (!(displayMedia === ONLY_MEDIA_NO_CONTENT && this.media) &&
          ((lengthLimit > 0 && lengthLimit <= (this.plainLength || 0)) || normalMsgLen > (mediaMsgCount ? 1024 : 4096))) ||
        mediaMsgCount > 1
      ) {
        messageType = TELEGRAPH_MESSAGE;
      } else {
        messageType = NORMAL_MESSAGE;
      }
    }

    if (messageType === TELEGRAPH_MESSAGE && this.telegraphLink === null) {
      await this.telegraphify();
    }

    if (this.telegraphLink === false && messageType === TELEGRAPH_MESSAGE) {
      if (this.link) {
        messageType = LINK_MESSAGE;
        if (sendMode === FORCE_TELEGRAPH) titleType = POST_TITLE_W_LINK;
      } else {
        messageType = NORMAL_MESSAGE;
      }
    }

    if (messageType === LINK_MESSAGE && titleType === NO_POST_TITLE && viaType === NO_VIA) {
      titleType = POST_TITLE_W_LINK;
    }

    if (messageType === NORMAL_MESSAGE && displayMedia === ONLY_MEDIA_NO_CONTENT && this.media) {
      messageType = LINK_MESSAGE;
    }

    if (titleType === NO_POST_TITLE && this.title && displayTitle === AUTO && (messageType === TELEGRAPH_MESSAGE || messageType === LINK_MESSAGE)) {
      titleType = POST_TITLE_NO_LINK;
    }

    const needMedia =
      Boolean(this.media && this.media.hasMedia) &&
      ((messageType === NORMAL_MESSAGE && displayMedia !== DISABLE) ||
        (messageType === LINK_MESSAGE && displayMedia === ONLY_MEDIA_NO_CONTENT));

    const needLinkPreview = linkPreview !== DISABLE && (linkPreview === FORCE_ENABLE || messageType !== NORMAL_MESSAGE);

    const optionHash = [subTitle, tags.join(","), titleType, viaType, needAuthor, messageType, messageStyle].join("|");
    this.paramToOptionCache.set(paramHash, optionHash);

    if (this.postBucket.has(optionHash)) {
      return this.postBucket.get(optionHash) || null;
    }

    if (
      (messageType === NORMAL_MESSAGE && displayMedia === ONLY_MEDIA_NO_CONTENT && !needMedia) ||
      (!this.parsedHtml && !needMedia && viaType === NO_VIA && titleType === NO_POST_TITLE && !needAuthor)
    ) {
      this.postBucket.set(optionHash, null);
      return null;
    }

    if (messageType === NORMAL_MESSAGE && normalMsgPost) {
      this.postBucket.set(optionHash, [normalMsgPost, needMedia, needLinkPreview]);
      return [normalMsgPost, needMedia, needLinkPreview];
    }

    const post = this.generateFormattedPost(subTitle, tags, titleType, viaType, Boolean(needAuthor), messageType, messageStyle);
    this.postBucket.set(optionHash, [post, needMedia, needLinkPreview]);
    return [post, needMedia, needLinkPreview];
  }

  private getPostHeaderAndFooter(
    subTitle: string | undefined,
    tags: Array<string>,
    titleType: TypePostTitleType,
    viaType: TypeViaType,
    needAuthor: boolean,
    messageType: TypeMessageType,
    messageStyle: TypeMessageStyle
  ): { header: string; footer: string } {
    const feedTitle = subTitle || this.feedTitle;
    const title = this.title || "Untitled";
    const tagsHtml = tags.length ? new Text(`#${tags.join(" #")}`).getHtml() : null;
    const authorHtml = needAuthor && this.author ? new Text(`(author: ${this.author})`).getHtml() : null;

    if (messageStyle === NORMAL_STYLE) {
      let titleText: Text | null = null;
      if (messageType === TELEGRAPH_MESSAGE) titleText = new Link(title, this.telegraphLink || undefined);
      else if (titleType === POST_TITLE_W_LINK) titleText = new Link(title, this.link || undefined);
      else if (titleType === POST_TITLE_NO_LINK) titleText = new Text(title);
      const titleHtml = titleText ? new Bold(new Underline(titleText)).getHtml() : null;

      let viaText: Text | null = null;
      if (viaType === FEED_TITLE_VIA_W_LINK) {
        viaText = new Text([new Text("via "), this.link ? new Link(feedTitle || "", this.link) : new Text(feedTitle || "")]);
      } else if (viaType === FEED_TITLE_VIA_NO_LINK) {
        viaText = new Text(`via ${feedTitle || ""}`);
      } else if (viaType === BARE_LINK_VIA && this.link) {
        viaText = new Text(this.link);
      } else if (viaType === TEXT_LINK_VIA && this.link) {
        viaText = new Link("source", this.link);
      }
      const viaHtml = viaText ? viaText.getHtml() : null;

      const header = `${titleHtml || ""}${titleHtml && tagsHtml ? "\n" : ""}${tagsHtml || ""}`;
      const footer = `${viaHtml || ""}${viaHtml && authorHtml ? " " : ""}${authorHtml || ""}`;
      return { header, footer };
    }

    if (messageStyle === FLOWERSS_STYLE) {
      const feedTitleHtml =
        viaType === FEED_TITLE_VIA_W_LINK || viaType === FEED_TITLE_VIA_NO_LINK
          ? feedTitle
            ? new Bold(feedTitle).getHtml()
            : null
          : null;
      let titleHtml: string | null = null;
      if (titleType === POST_TITLE_W_LINK) {
        titleHtml = new Bold(new Underline(new Link(title, this.link || undefined))).getHtml();
      } else if (titleType === POST_TITLE_NO_LINK) {
        titleHtml = new Bold(new Underline(title)).getHtml();
      }

      let sourcingHtml: string | null = null;
      if (messageType === TELEGRAPH_MESSAGE) {
        sourcingHtml = new Link("Telegraph", this.telegraphLink || undefined).getHtml();
        if (viaType === BARE_LINK_VIA && this.link) {
          sourcingHtml += `\n${this.link}`;
        } else if (viaType !== NO_VIA && this.link) {
          sourcingHtml += ` | ${new Link("source", this.link).getHtml()}`;
        }
      } else if (viaType === NO_VIA || viaType === FEED_TITLE_VIA_NO_LINK) {
        sourcingHtml = null;
      } else if (viaType === BARE_LINK_VIA && this.link) {
        sourcingHtml = this.link;
      } else {
        sourcingHtml = this.link ? new Link("source", this.link).getHtml() : null;
      }

      const header = `${feedTitleHtml || ""}${feedTitleHtml && titleHtml ? "\n" : ""}${titleHtml || ""}${(feedTitleHtml || titleHtml) && tagsHtml ? "\n" : ""}${tagsHtml || ""}`;
      const footer = `${sourcingHtml || ""}${sourcingHtml && authorHtml ? "\n" : ""}${authorHtml || ""}`;
      return { header, footer };
    }

    throw new Error(`Unknown message style: ${messageStyle}`);
  }

  private generateFormattedPost(
    subTitle: string | undefined,
    tags: Array<string>,
    titleType: TypePostTitleType,
    viaType: TypeViaType,
    needAuthor: boolean,
    messageType: TypeMessageType,
    messageStyle: TypeMessageStyle
  ): string {
    const { header, footer } = this.getPostHeaderAndFooter(subTitle, tags, titleType, viaType, needAuthor, messageType, messageStyle);
    const content = messageType === NORMAL_MESSAGE ? this.parsedHtml || "" : "";
    return `${header}${header && content ? "\n\n" : ""}${content}${(header || content) && footer ? "\n\n" : ""}${footer}`;
  }

  private async parseHtml(): Promise<void> {
    if (this.parsePromise) return this.parsePromise;
    this.parsePromise = (async () => {
      const parsed = await parse(this.html, this.feedLink);
      this.htmlTree = parsed.html_tree;
      this.media = parsed.media;
      this.parsedHtml = parsed.html;
      this.plainLength = getPlainTextLength(this.parsedHtml || "");
      this.html = parsed.parser.html;
      this.parsed = true;

      if (this.enclosures && this.enclosures.length) {
        this.enclosureMediums = [];
        for (const enclosure of this.enclosures) {
          if (!enclosure.url) continue;
          const dup = this.media.urlExists(enclosure.url, true);
          if (dup) {
            if (!dup.originalUrls.includes(enclosure.url)) {
              dup.urls.unshift(enclosure.url);
              dup.originalUrls.unshift(enclosure.url);
              dup.chosenUrl = enclosure.url;
            }
            continue;
          }
          let medium: AbstractMedium;
          if (!isAbsoluteHttpLink(enclosure.url)) {
            if (this.html.includes(`href="${enclosure.url}"`)) {
              continue;
            }
            medium = new File(enclosure.url);
          } else if (!enclosure.type) {
            medium = new File(enclosure.url);
          } else if (enclosure.type.includes("webp") || enclosure.type.includes("svg")) {
            medium = new Image(constructWeservUrlConvertTo2560(this.config.imagesWeserv, enclosure.url));
          } else if (enclosure.type.startsWith("image/gif")) {
            medium = new Animation(enclosure.url);
          } else if (enclosure.type.startsWith("audio")) {
            medium = new Audio(enclosure.url);
          } else if (enclosure.type.startsWith("video")) {
            medium = new Video(enclosure.url, enclosure.thumbnail || undefined);
          } else if (enclosure.type.startsWith("image")) {
            medium = new Image(enclosure.url);
          } else {
            medium = new File(enclosure.url);
          }
          this.media.add(medium);
          this.enclosureMediums.push(medium);
        }
      }
    })();
    await this.parsePromise;
  }

  private async telegraphify(): Promise<string | false> {
    if (this.telegraphLink !== null) return this.telegraphLink;
    if (this.telegraphPromise) return this.telegraphPromise;
    this.telegraphPromise = (async () => {
      let html = this.html;
      if (this.enclosureMediums && this.enclosureMediums.length) {
        const multimedia = this.enclosureMediums
          .map((medium) => medium.getMultimediaHtml())
          .filter(Boolean)
          .join("<br>");
        if (multimedia) {
          html += `<p>${multimedia}</p>`;
        }
      }
      try {
        const link = await telegraphIfy(this.config, html, {
          title: this.title,
          link: this.link,
          feedTitle: this.feedTitle,
          author: this.author,
          feedLink: this.feedLink
        });
        this.telegraphLink = link || false;
        return this.telegraphLink;
      } catch {
        this.telegraphLink = false;
        return this.telegraphLink;
      }
    })();
    return this.telegraphPromise;
  }
}

const partialRatio = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const arrA = Array.from(a);
  const arrB = Array.from(b);
  let short = arrA;
  let long = arrB;
  if (arrA.length > arrB.length) {
    short = arrB;
    long = arrA;
  }
  const shortLen = short.length;
  if (shortLen === 0) return 0;
  const windowCount = Math.max(1, long.length - shortLen + 1);
  let best = 0;
  for (let i = 0; i < windowCount; i += 1) {
    const window = long.slice(i, i + shortLen);
    const dist = levenshtein(short, window);
    const ratio = Math.round(100 * (1 - dist / shortLen));
    if (ratio > best) best = ratio;
    if (best === 100) break;
  }
  return best;
};

const levenshtein = (a: Array<string>, b: Array<string>): number => {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  const prev = new Array<number>(lenB + 1);
  const curr = new Array<number>(lenB + 1);
  for (let j = 0; j <= lenB; j += 1) prev[j] = j;
  for (let i = 1; i <= lenA; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= lenB; j += 1) prev[j] = curr[j];
  }
  return prev[lenB];
};
