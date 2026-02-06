import { describe, it, expect } from "vitest";
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

type PythonBaseline = {
  html: string;
  need_media: boolean;
  need_preview: boolean;
};

const newshackerFixture = JSON.parse(readFileSync("tests/fixtures/newshacker.entry.json", "utf8")) as Fixture;
const lowendtalkFixture = JSON.parse(readFileSync("tests/fixtures/lowendtalk.entry.json", "utf8")) as Fixture;

const newshackerBaseline = JSON.parse(
  readFileSync("tests/fixtures/newshacker.python.baseline.json", "utf8")
) as PythonBaseline;
const lowendtalkBaseline = JSON.parse(
  readFileSync("tests/fixtures/lowendtalk.python.baseline.json", "utf8")
) as PythonBaseline;

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
  telegraphToken: undefined,
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

describe("python parity", () => {
  it("matches newshacker output with default auto options", async () => {
    const formatting = resolveFormatting(sub, user, 5);
    const formatted = await formatPost(
      newshackerFixture.entry,
      feedOf("https://api.newshacker.me/rss", newshackerFixture.feedTitle),
      formatting,
      config
    );

    expect(formatted).not.toBeNull();
    expect(formatted?.html).toBe(newshackerBaseline.html);
    expect(formatted?.needMedia).toBe(newshackerBaseline.need_media);
    expect(formatted?.needLinkPreview).toBe(newshackerBaseline.need_preview);
  });

  it("matches lowendtalk output with default auto options", async () => {
    const formatting = resolveFormatting(sub, user, 5);
    const formatted = await formatPost(
      lowendtalkFixture.entry,
      feedOf("https://lowendtalk.com/discussions/feed.rss", lowendtalkFixture.feedTitle),
      formatting,
      config
    );

    expect(formatted).not.toBeNull();
    expect(formatted?.html).toBe(lowendtalkBaseline.html);
    expect(formatted?.needMedia).toBe(lowendtalkBaseline.need_media);
    expect(formatted?.needLinkPreview).toBe(lowendtalkBaseline.need_preview);
  });
});
