import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { formatPost, resolveFormatting } from "../src/parsing/format";

type Fixture = {
  feedTitle: string;
  feedLink: string;
  entry: {
    title: string;
    link: string;
    guid: string;
    author?: string;
    content: string;
    summary: string;
    published: string;
    tags: string[];
  };
};

const newshackerFixture = JSON.parse(readFileSync("tests/fixtures/newshacker.entry.json", "utf8")) as Fixture;
const lowendtalkLongFixture = JSON.parse(readFileSync("tests/fixtures/lowendtalk.long.entry.json", "utf8")) as Fixture;

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
  display_entry_tags: -1,
  style: 0,
  display_media: 0
};

const sub = {
  id: 1,
  state: 1,
  user_id: 1,
  feed_id: 1,
  title: null,
  tags: null,
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

const config = {
  botToken: "",
  webhookSecret: undefined,
  adminIds: new Set<number>(),
  multiuser: true,
  defaultInterval: 5,
  minimalInterval: 5,
  userSubLimit: -1,
  channelSubLimit: -1,
  imgRelayServer: "https://rsstt-img-relay.rongrong.workers.dev/",
  imagesWeserv: "https://wsrv.nl/",
  telegraphToken: "mock-token",
  defaultAdminChatId: undefined
};

const feedOf = (link: string, title: string) => ({
  id: 1,
  state: 1,
  link,
  title,
  interval: 5,
  etag: null,
  last_modified: null,
  error_count: 0,
  next_check_time: null,
  lock_until: null
});

describe("readability auto mode", () => {
  it("uses telegraph for long structured entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { url: "https://telegra.ph/newshacker-long" } })
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const formatting = resolveFormatting(sub, user, 5);
      const formatted = await formatPost(
        newshackerFixture.entry,
        feedOf("https://api.newshacker.me/rss", newshackerFixture.feedTitle),
        formatting,
        config
      );

      expect(formatted).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(formatted?.html).toContain("https://telegra.ph/newshacker-long");
      expect(formatted?.html).not.toContain("讨论背景");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses telegraph for lowendtalk long discussions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { url: "https://telegra.ph/lowendtalk-long" } })
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const formatting = resolveFormatting(sub, user, 5);
      const formatted = await formatPost(
        lowendtalkLongFixture.entry,
        feedOf("https://lowendtalk.com/discussions/feed.rss", lowendtalkLongFixture.feedTitle),
        formatting,
        config
      );

      expect(formatted).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(formatted?.html).toContain("https://telegra.ph/lowendtalk-long");
      expect(formatted?.html).not.toContain("Welcome to the");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
