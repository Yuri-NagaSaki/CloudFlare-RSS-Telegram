import { describe, it, expect } from "vitest";
import { generateEntryHash, formatPost, resolveFormatting } from "../src/parsing/format";

const entry = {
  title: "Hello",
  link: "https://example.com/hello",
  guid: "guid-1",
  author: "Author",
  content: "<p>Hi</p>",
  summary: "Hi",
  published: "2025-01-01T00:00:00Z",
  tags: ["tag1"]
};

const feed = {
  id: 1,
  state: 1,
  link: "https://example.com/rss",
  title: "Example Feed",
  interval: 10,
  etag: null,
  last_modified: null,
  error_count: 0,
  next_check_time: null,
  lock_until: null
};

const user = {
  id: 1,
  state: 0,
  lang: "en",
  admin: null,
  sub_limit: null,
  interval: null,
  notify: 1,
  send_mode: 0,
  length_limit: 0,
  link_preview: 0,
  display_author: 0,
  display_via: 0,
  display_title: 0,
  display_entry_tags: 1,
  style: 0,
  display_media: 0
};

const sub = {
  id: 1,
  state: 1,
  user_id: 1,
  feed_id: 1,
  title: null,
  tags: "custom",
  interval: null,
  notify: -100,
  send_mode: -100,
  length_limit: -100,
  link_preview: -100,
  display_author: -100,
  display_via: -100,
  display_title: -100,
  display_entry_tags: -100,
  style: -100,
  display_media: -100
};

describe("formatPost", () => {
  it("generates stable hash", () => {
    const hash1 = generateEntryHash(entry);
    const hash2 = generateEntryHash(entry);
    expect(hash1).toEqual(hash2);
  });

  it("formats post with title and tags", () => {
    const formatting = resolveFormatting(sub, user, 10);
    const formatted = formatPost(entry, feed, formatting);
    expect(formatted.html).toContain("Hello");
    expect(formatted.html).toContain("#custom");
  });
});
