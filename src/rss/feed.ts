import { XMLParser } from "fast-xml-parser";
import type { RuntimeConfig } from "../config";

export type FeedFetchResult = {
  url: string;
  status: number;
  etag?: string | null;
  lastModified?: string | null;
  content?: string;
  error?: string;
  feed?: NormalizedFeed;
};

export type NormalizedFeed = {
  title: string;
  link?: string;
  entries: NormalizedEntry[];
};

export type NormalizedEntry = {
  title?: string;
  link?: string;
  guid?: string;
  author?: string;
  content?: string;
  summary?: string;
  published?: string;
  tags?: string[];
  enclosures?: Array<{ url: string; type?: string; length?: number | null }>
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false
});

const normalizeToArray = <T>(value: T | T[] | undefined): T[] => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

export const fetchFeed = async (url: string, config: RuntimeConfig, headers: Record<string, string> = {}): Promise<FeedFetchResult> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/rdf+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/*;q=0.7, application/*;q=0.6",
      "User-Agent": "Tg-Rss-Worker",
      ...headers
    }
  });
  const status = response.status;
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (status === 304) {
    return { url: response.url, status, etag, lastModified };
  }
  const content = await response.text();
  if (!content) {
    return { url: response.url, status, etag, lastModified, error: "empty content" };
  }
  let feed: NormalizedFeed | undefined;
  try {
    const parsed = parser.parse(content);
    feed = normalizeFeed(parsed);
  } catch (err) {
    return { url: response.url, status, etag, lastModified, content, error: "parse error" };
  }
  if (!feed || (!feed.title && feed.entries.length === 0)) {
    return { url: response.url, status, etag, lastModified, content, error: "invalid feed" };
  }
  return { url: response.url, status, etag, lastModified, content, feed };
};

export const normalizeFeed = (parsed: unknown): NormalizedFeed | undefined => {
  if (!parsed || typeof parsed !== "object") return undefined;
  const data = parsed as Record<string, unknown>;
  if (data.rss) {
    return normalizeRss(data.rss as Record<string, unknown>);
  }
  if (data.feed) {
    return normalizeAtom(data.feed as Record<string, unknown>);
  }
  if (data["rdf:RDF"]) {
    return normalizeRdf(data["rdf:RDF"] as Record<string, unknown>);
  }
  return undefined;
};

const normalizeRss = (rss: Record<string, unknown>): NormalizedFeed => {
  const channel = (rss.channel || {}) as Record<string, unknown>;
  const title = extractText(channel.title) || "";
  const link = extractText(channel.link) || undefined;
  const items = normalizeToArray(channel.item as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
  const entries = items.map((item) => normalizeRssItem(item));
  return { title, link, entries };
};

const normalizeRdf = (rdf: Record<string, unknown>): NormalizedFeed => {
  const channel = (rdf.channel || {}) as Record<string, unknown>;
  const title = extractText(channel.title) || "";
  const link = extractText(channel.link) || undefined;
  const items = normalizeToArray(rdf.item as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
  const entries = items.map((item) => normalizeRssItem(item));
  return { title, link, entries };
};

const normalizeAtom = (feed: Record<string, unknown>): NormalizedFeed => {
  const title = extractText(feed.title) || "";
  const link = extractAtomLink(feed.link);
  const entries = normalizeToArray(feed.entry as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((entry) => normalizeAtomEntry(entry));
  return { title, link, entries };
};

const normalizeRssItem = (item: Record<string, unknown>): NormalizedEntry => {
  const title = extractText(item.title);
  const link = extractText(item.link) || extractText(item["atom:link"] as unknown as Record<string, unknown>);
  const guid = extractText(item.guid);
  const author = extractText(item.author) || extractText(item["dc:creator"] as unknown as Record<string, unknown>);
  const summary = extractText(item.description);
  const content = extractText(item["content:encoded"] as unknown as Record<string, unknown>) || summary;
  const pubDate = extractText(item.pubDate) || extractText(item.published) || extractText(item["dc:date"] as unknown as Record<string, unknown>);
  const tags = normalizeToArray(item.category as unknown as string | string[] | undefined).map((tag) => String(tag)).filter(Boolean);
  const enclosures = normalizeToArray(item.enclosure as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((enc) => ({
    url: String((enc as Record<string, unknown>)["@_url"] || ""),
    type: (enc as Record<string, unknown>)["@_type"] ? String((enc as Record<string, unknown>)["@_type"]) : undefined,
    length: (enc as Record<string, unknown>)["@_length"] ? Number((enc as Record<string, unknown>)["@_length"]) : undefined
  })).filter((enc) => enc.url);
  return { title, link, guid, author, content, summary, published: pubDate, tags, enclosures };
};

const normalizeAtomEntry = (entry: Record<string, unknown>): NormalizedEntry => {
  const title = extractText(entry.title);
  const link = extractAtomLink(entry.link);
  const guid = extractText(entry.id);
  const author = extractText((entry.author as Record<string, unknown> | undefined)?.name as unknown as Record<string, unknown>) || extractText(entry.author);
  const summary = extractText(entry.summary);
  const content = extractText(entry.content) || summary;
  const pubDate = extractText(entry.updated) || extractText(entry.published);
  const tags = normalizeToArray(entry.category as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((cat) => {
    if (typeof cat === "string") return cat;
    return String((cat as Record<string, unknown>)["@_term"] || "");
  }).filter(Boolean);
  return { title, link, guid, author, content, summary, published: pubDate, tags };
};

const extractText = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["#text"] === "string") return record["#text"] as string;
    if (typeof record["@_href"] === "string") return record["@_href"] as string;
  }
  return undefined;
};

const extractAtomLink = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  const links = normalizeToArray(value as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
  for (const link of links) {
    if (!link) continue;
    const rel = (link as Record<string, unknown>)["@_rel"];
    const href = (link as Record<string, unknown>)["@_href"];
    if (rel === "alternate" && typeof href === "string") return href;
  }
  const first = links[0] as Record<string, unknown> | undefined;
  if (first && typeof first["@_href"] === "string") return first["@_href"] as string;
  return undefined;
};

export const sniffFeedUrl = async (html: string): Promise<string | null> => {
  const match = html.match(/<link[^>]+rel=["']alternate["'][^>]+>/gi);
  if (!match) return null;
  for (const tag of match) {
    const typeMatch = tag.match(/type=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const type = typeMatch ? typeMatch[1] : "";
    if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
      return hrefMatch[1];
    }
  }
  return null;
};
