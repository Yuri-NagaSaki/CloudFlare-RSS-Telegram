import type { RuntimeConfig } from "../config";

export type UserRow = {
  id: number;
  state: number;
  lang: string;
  admin: number | null;
  sub_limit: number | null;
  interval: number | null;
  notify: number;
  send_mode: number;
  length_limit: number;
  link_preview: number;
  display_author: number;
  display_via: number;
  display_title: number;
  display_entry_tags: number;
  style: number;
  display_media: number;
};

export type FeedRow = {
  id: number;
  state: number;
  link: string;
  title: string;
  interval: number | null;
  etag: string | null;
  last_modified: string | null;
  error_count: number;
  next_check_time: string | null;
  lock_until: string | null;
};

export type SubRow = {
  id: number;
  state: number;
  user_id: number;
  feed_id: number;
  title: string | null;
  tags: string | null;
  interval: number | null;
  notify: number;
  send_mode: number;
  length_limit: number;
  link_preview: number;
  display_author: number;
  display_via: number;
  display_title: number;
  display_entry_tags: number;
  style: number;
  display_media: number;
};

export type OptionRow = {
  key: string;
  value: string | null;
};

export type EffectiveOptions = {
  default_interval: number;
  minimal_interval: number;
  user_sub_limit: number;
  channel_or_group_sub_limit: number;
  sub_limit_reached_message: string;
};

const DEFAULT_OPTIONS: EffectiveOptions = {
  default_interval: 10,
  minimal_interval: 5,
  user_sub_limit: -1,
  channel_or_group_sub_limit: -1,
  sub_limit_reached_message: ""
};

export const loadOptions = async (db: D1Database, config: RuntimeConfig): Promise<EffectiveOptions> => {
  const rows = await db.prepare("SELECT key, value FROM option").all<OptionRow>();
  const options: EffectiveOptions = { ...DEFAULT_OPTIONS };
  for (const row of rows.results) {
    if (row.key in options) {
      const casted = castOption(row.key as keyof EffectiveOptions, row.value);
      (options as Record<string, number | string>)[row.key] = casted as number | string;
    }
  }
  options.default_interval = config.defaultInterval;
  options.minimal_interval = config.minimalInterval;
  options.user_sub_limit = config.userSubLimit;
  options.channel_or_group_sub_limit = config.channelSubLimit;
  return options;
};

const castOption = (key: keyof EffectiveOptions, value: string | null): number | string => {
  if (value == null) return DEFAULT_OPTIONS[key];
  if (typeof DEFAULT_OPTIONS[key] === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : DEFAULT_OPTIONS[key];
  }
  return value;
};

export const setOption = async (db: D1Database, key: string, value: string | number): Promise<void> => {
  await db
    .prepare("INSERT INTO option (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
    .bind(key, String(value))
    .run();
};

export const getUser = async (db: D1Database, id: number): Promise<UserRow | null> => {
  const row = await db.prepare("SELECT * FROM user WHERE id = ?1").bind(id).first<UserRow>();
  return row ?? null;
};

export const getOrCreateUser = async (db: D1Database, id: number): Promise<UserRow> => {
  const existing = await getUser(db, id);
  if (existing) return existing;
  await db
    .prepare("INSERT INTO user (id, created_at, updated_at) VALUES (?1, datetime('now'), datetime('now'))")
    .bind(id)
    .run();
  const created = await getUser(db, id);
  if (!created) throw new Error("Failed to create user");
  return created;
};

export const updateUserLang = async (db: D1Database, id: number, lang: string): Promise<void> => {
  await db
    .prepare("UPDATE user SET lang = ?1, updated_at = datetime('now') WHERE id = ?2")
    .bind(lang, id)
    .run();
};

export const updateUserDefaults = async (db: D1Database, id: number, patch: Partial<UserRow>): Promise<void> => {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const assignments = fields.map((field, idx) => `${field} = ?${idx + 1}`).join(", ");
  const stmt = `UPDATE user SET ${assignments}, updated_at = datetime('now') WHERE id = ?${fields.length + 1}`;
  const values = fields.map((field) => (patch as Record<string, unknown>)[field]);
  await db.prepare(stmt).bind(...values, id).run();
};

export const getFeedByLink = async (db: D1Database, link: string): Promise<FeedRow | null> => {
  const row = await db.prepare("SELECT * FROM feed WHERE link = ?1").bind(link).first<FeedRow>();
  return row ?? null;
};

export const getFeedById = async (db: D1Database, id: number): Promise<FeedRow | null> => {
  const row = await db.prepare("SELECT * FROM feed WHERE id = ?1").bind(id).first<FeedRow>();
  return row ?? null;
};

export const createFeed = async (db: D1Database, link: string, title: string): Promise<FeedRow> => {
  await db
    .prepare("INSERT INTO feed (link, title, created_at, updated_at) VALUES (?1, ?2, datetime('now'), datetime('now'))")
    .bind(link, title)
    .run();
  const row = await getFeedByLink(db, link);
  if (!row) throw new Error("Failed to create feed");
  return row;
};

export const updateFeed = async (db: D1Database, id: number, patch: Partial<FeedRow>): Promise<void> => {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const assignments = fields.map((field, idx) => `${field} = ?${idx + 1}`).join(", ");
  const stmt = `UPDATE feed SET ${assignments}, updated_at = datetime('now') WHERE id = ?${fields.length + 1}`;
  const values = fields.map((field) => (patch as Record<string, unknown>)[field]);
  await db.prepare(stmt).bind(...values, id).run();
};

export const getSubByUserFeed = async (db: D1Database, userId: number, feedId: number): Promise<SubRow | null> => {
  const row = await db
    .prepare("SELECT * FROM sub WHERE user_id = ?1 AND feed_id = ?2")
    .bind(userId, feedId)
    .first<SubRow>();
  return row ?? null;
};

export const createSub = async (db: D1Database, userId: number, feedId: number, title?: string | null): Promise<SubRow> => {
  await db
    .prepare("INSERT INTO sub (user_id, feed_id, title, created_at, updated_at) VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))")
    .bind(userId, feedId, title ?? null)
    .run();
  const row = await getSubByUserFeed(db, userId, feedId);
  if (!row) throw new Error("Failed to create sub");
  return row;
};

export const updateSub = async (db: D1Database, subId: number, patch: Partial<SubRow>): Promise<void> => {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const assignments = fields.map((field, idx) => `${field} = ?${idx + 1}`).join(", ");
  const stmt = `UPDATE sub SET ${assignments}, updated_at = datetime('now') WHERE id = ?${fields.length + 1}`;
  const values = fields.map((field) => (patch as Record<string, unknown>)[field]);
  await db.prepare(stmt).bind(...values, subId).run();
};

export const deleteSub = async (db: D1Database, subId: number): Promise<void> => {
  await db.prepare("DELETE FROM sub WHERE id = ?1").bind(subId).run();
};

export const deleteSubByUserFeed = async (db: D1Database, userId: number, feedId: number): Promise<void> => {
  await db.prepare("DELETE FROM sub WHERE user_id = ?1 AND feed_id = ?2").bind(userId, feedId).run();
};

export const deleteAllSubs = async (db: D1Database, userId: number): Promise<void> => {
  await db.prepare("DELETE FROM sub WHERE user_id = ?1").bind(userId).run();
};

export const listSubsByUser = async (db: D1Database, userId: number, page: number, pageSize: number): Promise<{ total: number; subs: Array<SubRow & { feed_title: string; feed_link: string }>; }> => {
  const totalRow = await db.prepare("SELECT COUNT(*) as count FROM sub WHERE user_id = ?1").bind(userId).first<{ count: number }>();
  const total = totalRow?.count ?? 0;
  if (total === 0) return { total: 0, subs: [] };
  const offset = (Math.max(1, page) - 1) * pageSize;
  const rows = await db
    .prepare(
      "SELECT sub.*, feed.title as feed_title, feed.link as feed_link FROM sub JOIN feed ON sub.feed_id = feed.id WHERE sub.user_id = ?1 ORDER BY sub.id DESC LIMIT ?2 OFFSET ?3"
    )
    .bind(userId, pageSize, offset)
    .all<SubRow & { feed_title: string; feed_link: string }>();
  return { total, subs: rows.results };
};

export const listSubsByFeed = async (db: D1Database, feedId: number): Promise<Array<SubRow & { user: UserRow; feed: FeedRow }>> => {
  const rows = await db
    .prepare(
      "SELECT sub.*, user.id as user_id, user.state as user_state, user.lang as user_lang, user.admin as user_admin, user.sub_limit as user_sub_limit, user.interval as user_interval, user.notify as user_notify, user.send_mode as user_send_mode, user.length_limit as user_length_limit, user.link_preview as user_link_preview, user.display_author as user_display_author, user.display_via as user_display_via, user.display_title as user_display_title, user.display_entry_tags as user_display_entry_tags, user.style as user_style, user.display_media as user_display_media, feed.link as feed_link, feed.title as feed_title, feed.interval as feed_interval, feed.etag as feed_etag, feed.last_modified as feed_last_modified, feed.error_count as feed_error_count, feed.next_check_time as feed_next_check_time, feed.lock_until as feed_lock_until, feed.state as feed_state FROM sub JOIN user ON sub.user_id = user.id JOIN feed ON sub.feed_id = feed.id WHERE sub.feed_id = ?1 AND sub.state = 1"
    )
    .bind(feedId)
    .all<Record<string, unknown>>();

  return rows.results.map((row) => {
    const sub = row as unknown as SubRow;
    const user: UserRow = {
      id: row.user_id as number,
      state: row.user_state as number,
      lang: row.user_lang as string,
      admin: (row.user_admin as number) ?? null,
      sub_limit: (row.user_sub_limit as number) ?? null,
      interval: (row.user_interval as number) ?? null,
      notify: row.user_notify as number,
      send_mode: row.user_send_mode as number,
      length_limit: row.user_length_limit as number,
      link_preview: row.user_link_preview as number,
      display_author: row.user_display_author as number,
      display_via: row.user_display_via as number,
      display_title: row.user_display_title as number,
      display_entry_tags: row.user_display_entry_tags as number,
      style: row.user_style as number,
      display_media: row.user_display_media as number
    };
    const feed: FeedRow = {
      id: feedId,
      state: row.feed_state as number,
      link: row.feed_link as string,
      title: row.feed_title as string,
      interval: (row.feed_interval as number) ?? null,
      etag: (row.feed_etag as string) ?? null,
      last_modified: (row.feed_last_modified as string) ?? null,
      error_count: row.feed_error_count as number,
      next_check_time: (row.feed_next_check_time as string) ?? null,
      lock_until: (row.feed_lock_until as string) ?? null
    };
    return { ...sub, user, feed };
  });
};

export const updateFeedInterval = async (db: D1Database, feedId: number, options: EffectiveOptions): Promise<void> => {
  const row = await db
    .prepare("SELECT MIN(CASE WHEN interval IS NULL THEN ?2 ELSE interval END) as min_interval FROM sub WHERE feed_id = ?1 AND state = 1")
    .bind(feedId, options.default_interval)
    .first<{ min_interval: number | null }>();
  const interval = row?.min_interval ?? options.default_interval;
  const nextCheck = new Date(Date.now() + interval * 60 * 1000).toISOString();
  await updateFeed(db, feedId, { interval, next_check_time: nextCheck });
};

export const dueFeeds = async (db: D1Database, limit: number): Promise<FeedRow[]> => {
  const now = new Date().toISOString();
  const rows = await db
    .prepare(
      "SELECT * FROM feed WHERE state = 1 AND (next_check_time IS NULL OR next_check_time <= ?1) AND (lock_until IS NULL OR lock_until <= ?1) ORDER BY next_check_time ASC LIMIT ?2"
    )
    .bind(now, limit)
    .all<FeedRow>();
  return rows.results;
};

export const lockFeed = async (db: D1Database, feedId: number, seconds: number): Promise<void> => {
  const lockUntil = new Date(Date.now() + seconds * 1000).toISOString();
  await updateFeed(db, feedId, { lock_until: lockUntil });
};

export const upsertEntryHashes = async (db: D1Database, feedId: number, hashes: string[], publishedAt?: string): Promise<void> => {
  if (hashes.length === 0) return;
  const stmt = db.prepare("INSERT OR IGNORE INTO feed_entry (feed_id, entry_hash, published_at) VALUES (?1, ?2, ?3)");
  const batch = hashes.map((hash) => stmt.bind(feedId, hash, publishedAt ?? null));
  await db.batch(batch);
};

export const filterExistingHashes = async (db: D1Database, feedId: number, hashes: string[]): Promise<Set<string>> => {
  if (hashes.length === 0) return new Set();
  const placeholders = hashes.map(() => "?").join(", ");
  const sql = `SELECT entry_hash FROM feed_entry WHERE feed_id = ? AND entry_hash IN (${placeholders})`;
  const stmt = db.prepare(sql);
  const results = await stmt.bind(feedId, ...hashes).all<{ entry_hash: string }>();
  return new Set(results.results.map((row) => row.entry_hash));
};

export const pruneEntryHashes = async (db: D1Database, feedId: number, keep: number): Promise<void> => {
  if (keep <= 0) return;
  await db
    .prepare(
      "DELETE FROM feed_entry WHERE feed_id = ?1 AND entry_hash NOT IN (SELECT entry_hash FROM feed_entry WHERE feed_id = ?1 ORDER BY published_at DESC LIMIT ?2)"
    )
    .bind(feedId, keep)
    .run();
};
