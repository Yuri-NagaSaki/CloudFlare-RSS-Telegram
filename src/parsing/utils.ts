import { decode } from "he";
import { EMOJIFY_MAP } from "./weibo_emojify_map";

export const INT64_T_MAX = 9223372036854775807;

const SPACES = [
  "\u0020",
  "\u00a0",
  "\u2002",
  "\u2003",
  "\u2004",
  "\u2005",
  "\u2006",
  "\u2007",
  "\u2008",
  "\u2009",
  "\u200a",
  "\u200b",
  "\u202f",
  "\u205f",
  "\u3000"
].join("");

const INVALID_CHARACTERS = [
  "\u0000",
  "\u0001",
  "\u0002",
  "\u0003",
  "\u0004",
  "\u0005",
  "\u0006",
  "\u0007",
  "\u0008",
  "\u0009",
  "\u000b",
  "\u000c",
  "\u000e",
  "\u000f",
  "\u0010",
  "\u0011",
  "\u0012",
  "\u0013",
  "\u0014",
  "\u0015",
  "\u0016",
  "\u0017",
  "\u0018",
  "\u0019",
  "\u001a",
  "\u001b",
  "\u001c",
  "\u001d",
  "\u001e",
  "\u001f",
  "\u2028",
  "\u2029"
].join("");

const punctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const whitespace = " \t\r\n\v\f";

const invalidHashtagSet = new Set<string>([...SPACES, ...INVALID_CHARACTERS, ...punctuation, ...whitespace, "\u30fb"]);
invalidHashtagSet.delete("@");

const invalidHashtagChars = Array.from(invalidHashtagSet).join("");

const escapeCharClass = (value: string): string => value.replace(/[-\\\]]/g, "\\$&");

const INVALID_CHAR_RE = new RegExp(`[${escapeCharClass(INVALID_CHARACTERS)}]`, "g");
const SPECIAL_SPACE_RE = new RegExp(`[${escapeCharClass(SPACES.slice(1))}]`, "g");
const STRIP_LINE_END_RE = new RegExp(`[${escapeCharClass(SPACES)}]+\\n`, "g");
const STRIP_NEWLINE_RE = /\n{3,}/g;
const STRIP_ANY_SPACE_RE = /\s+/g;
const STRIP_BR_RE = /\s*<br\s*\/?\s*>\s*/gi;
const ESCAPE_HASHTAG_RE = new RegExp(`[${escapeCharClass(invalidHashtagChars)}]+`, "g");
const ABS_HTTP_RE = /^https?:\/\//i;
const SMALL_ICON_RE = /(width|height): ?(([012]?\d|30)(\.\d)?px|([01](\.\d)?|2)r?em)/i;

const EMOJIFY_KEYS = Object.keys(EMOJIFY_MAP)
  .map((key) => (key.startsWith("[") && key.endsWith("]") ? key.slice(1, -1) : key))
  .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .sort((a, b) => b.length - a.length);
const EMOJIFY_RE = new RegExp(`\\[(?:${EMOJIFY_KEYS.join("|")})\\]`, "g");

export const stripBr = (html: string): string => html.replace(STRIP_BR_RE, "<br>");
export const stripLineEnd = (html: string): string => html.replace(STRIP_LINE_END_RE, "\n");
export const stripNewline = (html: string): string => html.replace(STRIP_NEWLINE_RE, "\n\n");
export const stripAnySpace = (html: string): string => html.replace(STRIP_ANY_SPACE_RE, " ");

export const replaceInvalidCharacter = (value: string): string => value.replace(INVALID_CHAR_RE, " ");
export const replaceSpecialSpace = (value: string): string => value.replace(SPECIAL_SPACE_RE, " ");

export const escapeHashtag = (tag: string): string => tag.replace(ESCAPE_HASHTAG_RE, "_").replace(/^_+|_+$/g, "");
export const escapeHashtags = (tags?: Array<string> | null): Array<string> => (tags ? tags.map(escapeHashtag).filter(Boolean) : []);
export const mergeTags = (...tagLists: Array<Array<string> | undefined | null>): Array<string> => {
  const merged: Array<string> = [];
  const seen = new Set<string>();
  for (const list of tagLists) {
    if (!list) continue;
    for (const tag of list) {
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      merged.push(tag);
    }
  }
  return merged;
};

export const isAbsoluteHttpLink = (value: string | undefined): boolean => {
  if (!value) return false;
  return ABS_HTTP_RE.test(value);
};

export const resolveRelativeLink = (base: string | undefined, url: string | undefined): string => {
  if (!base || !url || isAbsoluteHttpLink(url) || !isAbsoluteHttpLink(base)) return url || "";
  try {
    return new URL(url, base).toString();
  } catch {
    return url || "";
  }
};

export const emojify = (xml: string): string => {
  if (!xml) return xml;
  return xml.replace(EMOJIFY_RE, (match) => EMOJIFY_MAP[match] || match);
};

export const isEmoticon = (tag: { name?: string; attribs?: Record<string, string> }): boolean => {
  if (!tag || tag.name !== "img") return false;
  const attrs = tag.attribs || {};
  const src = attrs.src || "";
  const alt = attrs.alt || "";
  const cls = attrs.class || "";
  const style = attrs.style || "";
  const width = attrs.width ? Number(attrs.width) : INT64_T_MAX;
  const height = attrs.height ? Number(attrs.height) : INT64_T_MAX;
  return (
    width <= 30 ||
    height <= 30 ||
    SMALL_ICON_RE.test(style) ||
    cls.includes("emoji") ||
    cls.includes("emoticon") ||
    (alt.startsWith(":") && alt.endsWith(":")) ||
    src.startsWith("data:")
  );
};

export const htmlValidator = (html: string): string => {
  if (!html) return html;
  let result = html;
  result = stripBr(result);
  result = replaceInvalidCharacter(result);
  return result;
};

export const ensurePlain = (value: string, enableEmojify = false): string => {
  if (!value) return value;
  let text = value;
  if (text.includes("<") && text.includes(">")) {
    text = text.replace(/<[^>]+>/g, "");
  }
  text = stripAnySpace(replaceSpecialSpace(replaceInvalidCharacter(decode(text)))).trim();
  return enableEmojify ? emojify(text) : text;
};

export type Enclosure = {
  url: string;
  length?: number | null;
  type?: string;
  duration?: string | null;
  thumbnail?: string | null;
};

export const parseEntry = (entry: {
  content?: string;
  summary?: string;
  link?: string;
  guid?: string;
  author?: string;
  title?: string;
  tags?: Array<string>;
  enclosures?: Array<Enclosure>;
}): {
  content: string;
  link?: string;
  author?: string;
  title?: string;
  tags?: Array<string>;
  enclosures?: Array<Enclosure>;
} => {
  const contentRaw = entry.content || entry.summary || "";
  const content = htmlValidator(contentRaw);
  const link = entry.link || entry.guid;
  const author = entry.author ? ensurePlain(entry.author) || undefined : undefined;
  const title = entry.title ? ensurePlain(entry.title, true) || undefined : undefined;
  const tags = entry.tags ? entry.tags.filter(Boolean) : undefined;
  return { content, link, author, title, tags, enclosures: entry.enclosures };
};
