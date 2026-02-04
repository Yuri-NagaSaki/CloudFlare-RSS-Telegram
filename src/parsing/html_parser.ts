import { parseHtml, type HtmlElement, type HtmlNode, type HtmlText } from "./html_dom";
import { HtmlTree, Text, Link, Bold, Italic, Underline, Blockquote, Code, Pre, Br, Hr, ListItem, OrderedList, UnorderedList } from "./html_node";
import { Media, Image, Video, Audio, Animation } from "./medium";
import { stripNewline, stripLineEnd, resolveRelativeLink, isAbsoluteHttpLink, emojify, isEmoticon } from "./utils";

const srcsetParser = /(?:^|,\s*)(?<url>\S+)(?:\s+(?<number>\d+(\.\d+)?)(?<unit>[wx]))?\s*(?=,|$)/g;

const effectiveLink = (content: Text | string, href: string, base?: string): Text | Link => {
  if (href.startsWith("javascript")) {
    return content instanceof Text ? content : new Text(content);
  }
  const resolved = resolveRelativeLink(base, href);
  if (!isAbsoluteHttpLink(resolved)) {
    return new Text([new Text(`${content} (`), new Code(resolved), new Text(")")]);
  }
  return new Link(content instanceof Text ? content : new Text(content), resolved);
};

export class Parser {
  html: string;
  feedLink?: string;
  soup: Array<HtmlNode> | null = null;
  media: Media = new Media();
  htmlTree: HtmlTree = new HtmlTree("");
  parsed = false;
  private parseItemCount = 0;

  constructor(html: string, feedLink?: string) {
    this.html = html;
    this.feedLink = feedLink;
  }

  async parse(): Promise<void> {
    this.soup = parseHtml(this.html);
    const parsed = await this.parseItem(this.soup);
    this.htmlTree = new HtmlTree(parsed || "");
    this.parsed = true;
  }

  getParsedHtml(): string {
    if (!this.parsed) {
      throw new Error("You must parse the HTML first");
    }
    return stripNewline(stripLineEnd(this.htmlTree.getHtml().trim()));
  }

  private async parseItem(soup: HtmlNode | Array<HtmlNode>, inList = false): Promise<Text | null> {
    this.parseItemCount += 1;
    if (Array.isArray(soup)) {
      const result: Array<Text> = [];
      let prevTagName: string | null = null;
      for (const child of soup) {
        const item = await this.parseItem(child, inList);
        if (!item) continue;
        const tagName = isTag(child) ? child.name : null;
        if ((tagName === "div" || prevTagName === "div") && result.length > 0) {
          const last = result[result.length - 1].getHtml();
          const curr = item.getHtml();
          if (!(last.endsWith("\n") || curr.startsWith("\n"))) {
            result.push(new Br());
          }
        }
        result.push(item);
        prevTagName = tagName;
      }
      if (result.length === 0) return null;
      return result.length === 1 ? result[0] : new Text(result);
    }

    if (isText(soup)) {
      const text = soup.data || "";
      if (!text) return null;
      return new Text(emojify(text));
    }

    if (!isTag(soup)) return null;

    const tag = soup.name;
    if (!tag || tag === "script") return null;

    if (tag === "table") {
      const rows = soup.children.filter((n) => isTag(n) && n.name === "tr") as Array<HtmlElement>;
      if (rows.length === 0) return null;
      const rowsContent: Array<Text> = [];
      for (let i = 0; i < rows.length; i += 1) {
        const columns = rows[i].children.filter((n) => isTag(n) && (n.name === "td" || n.name === "th")) as Array<HtmlElement>;
        if (rows.length > 1 && columns.length > 1) {
          return null;
        }
        for (let j = 0; j < columns.length; j += 1) {
          const rowContent = await this.parseItem(columns[j], inList);
          if (rowContent) {
            rowsContent.push(rowContent);
            if (i < rows.length - 1 || j < columns.length - 1) {
              rowsContent.push(new Br(2));
            }
          }
        }
      }
      return rowsContent.length ? new Text(rowsContent) : null;
    }

    if (tag === "p" || tag === "section") {
      const parent = (soup.parent as HtmlElement | null)?.name;
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      if (!text) return null;
      if (parent === "li") return text;
      const texts: Array<Text> = [text];
      const prev = soup.prev as HtmlElement | null;
      const next = soup.next as HtmlElement | null;
      if (!(prev && prev.name === "blockquote")) texts.unshift(new Br());
      if (!(next && next.name === "blockquote")) texts.push(new Br());
      return texts.length > 1 ? new Text(texts) : text;
    }

    if (tag === "blockquote") {
      const quote = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      if (!quote) return null;
      quote.strip();
      if (quote.isEmpty()) return null;
      return new Blockquote(quote);
    }

    if (tag === "q") {
      const quote = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      if (!quote) return null;
      quote.strip();
      if (quote.isEmpty()) return null;
      const cite = soup.attribs?.cite;
      const inner = cite ? effectiveLink(quote, cite, this.feedLink) : quote;
      return new Text([new Text("\u201c"), inner as Text, new Text("\u201d")]);
    }

    if (tag === "pre") {
      return new Pre(await this.parseItem(soup.children as Array<HtmlNode>, inList));
    }

    if (tag === "code") {
      let className: string | null = null;
      const cls = soup.attribs?.class;
      if (cls) {
        const parts = String(cls).split(/\s+/g);
        const found = parts.find((p) => p.startsWith("language-"));
        if (found) className = found;
        else if (parts.length > 0) className = `language-${parts[0]}`;
      }
      return new Code(await this.parseItem(soup.children as Array<HtmlNode>, inList), className || undefined);
    }

    if (tag === "br") return new Br();

    if (tag === "a") {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      if (!text || text.isEmpty()) return null;
      const href = soup.attribs?.href;
      if (!href) return null;
      return effectiveLink(text, href, this.feedLink);
    }

    if (tag === "img") {
      const src = soup.attribs?.src;
      const srcset = soup.attribs?.srcset;
      if (!(src || srcset)) return null;
      if (isEmoticon(soup)) {
        const alt = soup.attribs?.alt;
        return alt ? new Text(emojify(alt)) : null;
      }
      const multiSrc: Array<string> = [];
      if (srcset) {
        const matches = Array.from(String(srcset).matchAll(srcsetParser)).map((match) => ({
          url: match.groups?.url || "",
          number: match.groups?.number ? Number(match.groups.number) : 1,
          unit: match.groups?.unit || "x"
        }));
        if (src) matches.push({ url: src, number: 1, unit: "x" });
        const unitW = matches.filter((m) => m.unit === "w").sort((a, b) => b.number - a.number);
        const unitX = matches.filter((m) => m.unit === "x").sort((a, b) => b.number - a.number);
        while (unitW.length || unitX.length) {
          const srcW = unitW.length ? unitW.shift() : null;
          const srcX = unitX.length ? unitX.shift() : null;
          if (srcW) multiSrc.push(srcW.url);
          if (srcX) {
            if (srcX.number <= 1 && unitW.length) {
              unitX.unshift(srcX);
              continue;
            }
            multiSrc.push(srcX.url);
          }
        }
      } else if (src) {
        multiSrc.push(src);
      }

      const resolved: Array<string> = [];
      let isGif = false;
      for (const _src of multiSrc) {
        if (!_src) continue;
        const resolvedSrc = resolveRelativeLink(this.feedLink, _src);
        const path = safePathFromUrl(resolvedSrc);
        if (path && /(\.gif|\.gifv|\.webm|\.mp4|\.m4v)$/i.test(path)) {
          isGif = true;
        }
        resolved.push(resolvedSrc);
      }
      if (resolved.length) {
        this.media.add(isGif ? new Animation(resolved) : new Image(resolved));
      }
      return null;
    }

    if (tag === "video") {
      const poster = soup.attribs?.poster;
      const multiSrc = getMultiSrc(soup, this.feedLink);
      if (multiSrc.length) {
        this.media.add(new Video(multiSrc, poster ? resolveRelativeLink(this.feedLink, poster) : undefined));
      }
      return null;
    }

    if (tag === "audio") {
      const multiSrc = getMultiSrc(soup, this.feedLink);
      if (multiSrc.length) {
        this.media.add(new Audio(multiSrc));
      }
      return null;
    }

    if (tag === "b" || tag === "strong") {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      return text ? new Bold(text) : null;
    }

    if (tag === "i" || tag === "em") {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      return text ? new Italic(text) : null;
    }

    if (tag === "u" || tag === "ins") {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      return text ? new Underline(text) : null;
    }

    if (tag === "h1") {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      return text ? new Text([new Br(2), new Bold(new Underline(text)), new Br()]) : null;
    }

    if (tag === "h2") {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      return text ? new Text([new Br(2), new Bold(text), new Br()]) : null;
    }

    if (tag === "hr") return new Hr();

    if (tag.startsWith("h") && tag.length === 2) {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
      return text ? new Text([new Br(2), new Underline(text), new Br()]) : null;
    }

    if (tag === "iframe") {
      const src = soup.attribs?.src;
      if (!src) return null;
      const resolved = resolveRelativeLink(this.feedLink, src);
      const title = hostnameFromUrl(resolved);
      return new Text([new Br(2), effectiveLink(`iframe (${title})`, resolved, this.feedLink), new Br(2)]);
    }

    if (tag === "ol" || tag === "ul" || tag === "menu" || tag === "dir") {
      const texts: Array<Text> = [];
      const listItems = soup.children.filter((n) => isTag(n) && n.name === "li") as Array<HtmlElement>;
      if (!listItems.length) return null;
      for (const listItem of listItems) {
        const text = await this.parseItem(listItem, true);
        if (text) texts.push(text);
      }
      if (!texts.length) return null;
      return tag === "ol" ? new OrderedList([new Br(), ...texts, new Br()]) : new UnorderedList([new Br(), ...texts, new Br()]);
    }

    if (tag === "li") {
      const text = await this.parseItem(soup.children as Array<HtmlNode>, true);
      if (!text) return null;
      text.strip(true);
      if (!text.getHtml().trim()) return null;
      return inList ? new ListItem(text) : new UnorderedList([new Br(), new ListItem(text), new Br()]);
    }

    const text = await this.parseItem(soup.children as Array<HtmlNode>, inList);
    return text || null;
  }
}

export type Parsed = {
  html_tree: HtmlTree;
  media: Media;
  html: string;
  parser: Parser;
};

export const parse = async (html: string, feedLink?: string): Promise<Parsed> => {
  const parser = new Parser(html, feedLink);
  await parser.parse();
  return { html_tree: parser.htmlTree, media: parser.media, html: parser.getParsedHtml(), parser };
};

const isTag = (node: HtmlNode): node is HtmlElement => (node as HtmlElement).type === "tag";
const isText = (node: HtmlNode): node is HtmlText => (node as HtmlText).type === "text";

const safePathFromUrl = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const hostnameFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const getMultiSrc = (node: HtmlElement, base?: string): Array<string> => {
  const src = node.attribs?.src;
  const sources = (node.children || [])
    .filter((child) => isTag(child) && child.name === "source" && child.attribs?.src)
    .map((child) => (child as HtmlElement).attribs!.src as string);
  if (src) sources.push(src);
  return sources.map((u) => resolveRelativeLink(base, u)).filter(Boolean);
};
