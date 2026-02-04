import { describe, it, expect } from "vitest";
import { normalizeFeed } from "../src/rss/feed";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, "..", "fixtures", "catcat.blog.rss.xml");
const xml = fs.readFileSync(fixturePath, "utf-8");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false
});

const parsed = parser.parse(xml);

describe("rss normalize", () => {
  it("extracts entries", () => {
    const feed = normalizeFeed(parsed);
    expect(feed).toBeTruthy();
    expect(feed?.entries.length).toBeGreaterThan(0);
    expect(feed?.entries[0].title).toBe("First Post");
  });
});
