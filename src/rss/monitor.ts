import type { Env, RuntimeConfig } from "../config";
import { fetchFeed, sniffFeedUrl, type NormalizedEntry } from "./feed";
import { loadOptions, dueFeeds, lockFeed, updateFeed, filterExistingHashes, upsertEntryHashes, pruneEntryHashes, listSubsByFeed } from "../db/queries";
import { generateEntryHash, formatPost, resolveFormatting } from "../parsing/format";
import { sendFormattedPost } from "../telegram/sender";

const MAX_FEEDS_PER_RUN = 20;
const FEED_LOCK_SECONDS = 55;
const ENTRY_KEEP = 300;

export const runMonitor = async (env: Env, config: RuntimeConfig): Promise<void> => {
  const options = await loadOptions(env.DB, config);
  const feeds = await dueFeeds(env.DB, MAX_FEEDS_PER_RUN);
  for (const feed of feeds) {
    try {
      await lockFeed(env.DB, feed.id, FEED_LOCK_SECONDS);
      const headers: Record<string, string> = {};
      if (feed.etag) headers["If-None-Match"] = feed.etag;
      if (feed.last_modified) headers["If-Modified-Since"] = feed.last_modified;

      const result = await fetchFeed(feed.link, config, headers);
      if (result.status === 304) {
        const nextCheck = new Date(Date.now() + (feed.interval || options.default_interval) * 60 * 1000).toISOString();
        await updateFeed(env.DB, feed.id, { next_check_time: nextCheck, error_count: 0 });
        continue;
      }
      if (!result.feed) {
        const nextCheck = new Date(Date.now() + (feed.interval || options.default_interval) * 60 * 1000).toISOString();
        const errorCount = (feed.error_count || 0) + 1;
        await updateFeed(env.DB, feed.id, { next_check_time: nextCheck, error_count: errorCount });
        continue;
      }

      const currentFeed = result.feed;
      const hashes = currentFeed.entries.map(generateEntryHash);
      const existing = await filterExistingHashes(env.DB, feed.id, hashes);
      const newEntries: NormalizedEntry[] = [];
      currentFeed.entries.forEach((entry, idx) => {
        if (!existing.has(hashes[idx])) newEntries.push(entry);
      });

      const nowNext = new Date(Date.now() + (feed.interval || options.default_interval) * 60 * 1000).toISOString();
      await updateFeed(env.DB, feed.id, {
        title: currentFeed.title || feed.title,
        etag: result.etag ?? null,
        last_modified: result.lastModified ?? null,
        next_check_time: nowNext,
        error_count: 0
      });

      if (newEntries.length === 0) {
        continue;
      }

      const subs = await listSubsByFeed(env.DB, feed.id);
      for (const entry of newEntries.reverse()) {
        for (const sub of subs) {
          const formatting = resolveFormatting(sub, sub.user, options.default_interval);
          const formatted = await formatPost(entry, sub.feed, formatting, config);
          if (!formatted) continue;
          await sendFormattedPost(config, sub.user_id, formatted.html, formatted.media, {
            disableNotification: formatting.notify === 0,
            needMedia: formatted.needMedia,
            needLinkPreview: formatted.needLinkPreview
          });
        }
      }

      await upsertEntryHashes(env.DB, feed.id, hashes, newEntries[0]?.published);
      await pruneEntryHashes(env.DB, feed.id, ENTRY_KEEP);
    } catch (err) {
      const nextCheck = new Date(Date.now() + (feed.interval || options.default_interval) * 60 * 1000).toISOString();
      const errorCount = (feed.error_count || 0) + 1;
      await updateFeed(env.DB, feed.id, { next_check_time: nextCheck, error_count: errorCount });
    }
  }
};

export const trySniffFeed = async (env: Env, url: string, html: string): Promise<string | null> => {
  const cached = await env.KV.get(`feed_sniff:${url}`);
  if (cached) return cached === "null" ? null : cached;
  const sniffed = await sniffFeedUrl(html);
  if (sniffed) {
    const resolved = new URL(sniffed, url).toString();
    await env.KV.put(`feed_sniff:${url}`, resolved, { expirationTtl: 60 * 60 * 24 });
    return resolved;
  }
  await env.KV.put(`feed_sniff:${url}`, "null", { expirationTtl: 60 * 60 * 24 });
  return null;
};
