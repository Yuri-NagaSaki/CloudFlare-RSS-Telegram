import { XMLParser, XMLBuilder } from "fast-xml-parser";

export type OpmlFeed = { url: string; title?: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true
});

export const parseOpml = (xml: string): OpmlFeed[] => {
  const data = parser.parse(xml);
  const body = data?.opml?.body;
  if (!body) return [];
  const feeds: OpmlFeed[] = [];
  collectOutlines(body.outline, feeds);
  return feeds;
};

const collectOutlines = (outline: unknown, feeds: OpmlFeed[]): void => {
  if (!outline) return;
  if (Array.isArray(outline)) {
    outline.forEach((item) => collectOutlines(item, feeds));
    return;
  }
  if (typeof outline !== "object") return;
  const node = outline as Record<string, unknown>;
  const url = node["@_xmlUrl"] || node["@_xmlurl"] || node["@_url"];
  if (typeof url === "string") {
    const title = typeof node["@_title"] === "string" ? (node["@_title"] as string) : undefined;
    feeds.push({ url, title });
  }
  if (node.outline) collectOutlines(node.outline, feeds);
};

export const buildOpml = (feeds: OpmlFeed[]): string => {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true });
  const outlines = feeds.map((feed) => ({
    "@_text": feed.title || feed.url,
    "@_title": feed.title || feed.url,
    "@_type": "rss",
    "@_xmlUrl": feed.url
  }));
  const opml = {
    opml: {
      "@_version": "2.0",
      head: { title: "Subscriptions in RSStT" },
      body: { outline: outlines }
    }
  };
  return builder.build(opml);
};
