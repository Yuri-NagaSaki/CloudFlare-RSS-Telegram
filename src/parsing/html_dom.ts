import { decode } from "he";

export type HtmlNode = HtmlElement | HtmlText;

export type HtmlElement = {
  type: "tag";
  name: string;
  attribs: Record<string, string>;
  children: Array<HtmlNode>;
  parent?: HtmlElement;
  prev?: HtmlNode;
  next?: HtmlNode;
};

export type HtmlText = {
  type: "text";
  data: string;
  parent?: HtmlElement;
  prev?: HtmlNode;
  next?: HtmlNode;
};

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

const RAW_TEXT_TAGS = new Set(["script", "style"]);

export const parseHtml = (html: string): Array<HtmlNode> => {
  const root: HtmlElement = { type: "tag", name: "root", attribs: {}, children: [] };
  const stack: Array<HtmlElement> = [root];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      appendText(stack[stack.length - 1], html.slice(i));
      break;
    }
    if (lt > i) {
      appendText(stack[stack.length - 1], html.slice(i, lt));
    }
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) break;
    let tagContent = html.slice(lt + 1, gt);
    const isClosing = tagContent.trim().startsWith("/");
    const isSelfClosing = /\/\s*$/.test(tagContent);
    tagContent = tagContent.replace(/^\s*\//, "").replace(/\s*\/\s*$/, "").trim();
    const spaceIdx = tagContent.search(/\s/);
    const tagName = (spaceIdx === -1 ? tagContent : tagContent.slice(0, spaceIdx)).toLowerCase();
    const attrString = spaceIdx === -1 ? "" : tagContent.slice(spaceIdx + 1);

    if (!tagName || tagName.startsWith("!")) {
      i = gt + 1;
      continue;
    }

    if (isClosing) {
      for (let s = stack.length - 1; s >= 1; s -= 1) {
        if (stack[s].name === tagName) {
          stack.splice(s);
          break;
        }
      }
      i = gt + 1;
      continue;
    }

    if (RAW_TEXT_TAGS.has(tagName)) {
      const closeTag = `</${tagName}>`;
      const end = html.indexOf(closeTag, gt + 1);
      i = end === -1 ? html.length : end + closeTag.length;
      continue;
    }

    const element: HtmlElement = {
      type: "tag",
      name: tagName,
      attribs: parseAttributes(attrString),
      children: []
    };
    appendChild(stack[stack.length - 1], element);
    if (!isSelfClosing && !VOID_TAGS.has(tagName)) {
      stack.push(element);
    }
    i = gt + 1;
  }
  return root.children;
};

const appendChild = (parent: HtmlElement, child: HtmlNode): void => {
  const siblings = parent.children;
  const prev = siblings.length ? siblings[siblings.length - 1] : undefined;
  if (prev) {
    prev.next = child;
    child.prev = prev;
  }
  child.parent = parent;
  siblings.push(child);
};

const appendText = (parent: HtmlElement, text: string): void => {
  if (!text) return;
  appendChild(parent, { type: "text", data: decode(text) });
};

const parseAttributes = (input: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const attrRe = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(input)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? key;
    attrs[key] = decode(value);
  }
  return attrs;
};
