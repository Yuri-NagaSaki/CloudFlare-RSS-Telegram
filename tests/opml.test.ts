import { describe, it, expect } from "vitest";
import { parseOpml, buildOpml } from "../src/opml/opml";

const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Subscriptions</title></head>
  <body>
    <outline text="Feed" title="Feed" type="rss" xmlUrl="https://example.com/rss" />
  </body>
</opml>`;

describe("opml", () => {
  it("parses opml", () => {
    const feeds = parseOpml(opml);
    expect(feeds.length).toBe(1);
    expect(feeds[0].url).toBe("https://example.com/rss");
  });

  it("builds opml", () => {
    const xml = buildOpml([{ url: "https://example.com/rss", title: "Feed" }]);
    expect(xml).toContain("xmlUrl=\"https://example.com/rss\"");
  });
});
