import type { Env, RuntimeConfig } from "../config";
import { parseCommand, isManager, ensureMultiuser, resolveLang, buildCommandsList, getEffectiveOptions } from "./utils";
import { t, ALL_LANGS } from "../i18n";
import {
  getOrCreateUser,
  updateUserLang,
  getFeedByLink,
  createFeed,
  getSubByUserFeed,
  createSub,
  updateFeedInterval,
  listSubsByUser,
  deleteSubByUserFeed,
  deleteSub,
  deleteAllSubs,
  updateSub,
  getUser,
  updateUserDefaults,
  setOption
} from "../db/queries";
import { fetchFeed } from "../rss/feed";
import { trySniffFeed } from "../rss/monitor";
import { sendMessage, editMessageText, answerCallbackQuery, answerInlineQuery, getFile, downloadFile, telegramFetch, sendDocument } from "../telegram/client";
import { parseOpml, buildOpml } from "../opml/opml";
import { formatPost, resolveFormatting } from "../parsing/format";
import { sendFormattedPost } from "../telegram/sender";

const PAGE_SIZE = 30;
const USER_STATE_IDLE = 0;
const USER_STATE_WAITING_SUB_URL = 1;

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number };
  text?: string;
  caption?: string;
  document?: { file_id: string; file_name?: string };
  reply_to_message?: TelegramMessage;
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: TelegramMessage;
  from: { id: number };
};

export type TelegramInlineQuery = {
  id: string;
  from: { id: number };
  query: string;
};

export const handleUpdate = async (env: Env, config: RuntimeConfig, update: TelegramUpdate): Promise<void> => {
  if (update.inline_query) {
    await handleInlineQuery(env, config, update.inline_query);
    return;
  }
  if (update.callback_query) {
    await handleCallback(env, config, update.callback_query);
    return;
  }
  if (update.message) {
    await handleMessage(env, config, update.message);
  }
};

const handleInlineQuery = async (_env: Env, config: RuntimeConfig, query: TelegramInlineQuery): Promise<void> => {
  const text = query.query.trim();
  if (!text) {
    await answerInlineQuery(config, query.id, []);
    return;
  }
  const results = [
    {
      type: "article",
      id: "1",
      title: text,
      input_message_content: { message_text: text }
    }
  ];
  await answerInlineQuery(config, query.id, results);
};

const handleCallback = async (env: Env, config: RuntimeConfig, cb: TelegramCallbackQuery): Promise<void> => {
  const data = cb.data || "";
  const message = cb.message;
  const chatId = message?.chat.id;
  if (!chatId) return;
  const user = await getOrCreateUser(env.DB, chatId);
  const lang = resolveLang(user.lang);

  if (data.startsWith("set_lang=")) {
    const langCode = data.split("=")[1];
    const newLang = ALL_LANGS.includes(langCode) ? langCode : "zh-Hans";
    await updateUserLang(env.DB, chatId, newLang);
    await setBotCommands(config, chatId, newLang);
    await answerCallbackQuery(config, cb.id);
    await sendMessage(config, chatId, t(newLang, "welcome_prompt"), { disablePreview: true });
    return;
  }

  if (data.startsWith("list|")) {
    const page = Number(data.split("|")[1]) || 1;
    await sendList(env, config, chatId, lang, page, message?.message_id);
    await answerCallbackQuery(config, cb.id);
    return;
  }

  if (data.startsWith("unsub=")) {
    const subId = Number(data.split("=")[1]);
    if (Number.isFinite(subId)) {
      const sub = await env.DB.prepare("SELECT * FROM sub WHERE id = ?1").bind(subId).first<any>();
      if (sub) {
        await deleteSub(env.DB, subId);
        const options = await getEffectiveOptions(env, config);
        await updateFeedInterval(env.DB, sub.feed_id, options);
      }
      await answerCallbackQuery(config, cb.id, t(lang, "unsub_successful"));
      await sendList(env, config, chatId, lang, 1, message?.message_id);
      return;
    }
  }

  if (data.startsWith("set=")) {
    const subId = Number(data.split("=")[1]);
    if (Number.isFinite(subId)) {
      await showSubSettings(env, config, chatId, subId, lang, message?.message_id);
      await answerCallbackQuery(config, cb.id);
      return;
    }
  }

  if (data.startsWith("toggle=")) {
    const [subIdRaw, key] = data.slice("toggle=".length).split(":");
    const subId = Number(subIdRaw);
    if (Number.isFinite(subId) && key) {
      await toggleSubOption(env, subId, key);
      await showSubSettings(env, config, chatId, subId, lang, message?.message_id);
      await answerCallbackQuery(config, cb.id);
      return;
    }
  }

  if (data.startsWith("set_default=")) {
    const [, key] = data.slice("set_default=".length).split(":");
    if (key) {
      await toggleUserDefault(env, chatId, key);
    }
    await showUserSettings(env, config, chatId, lang, message?.message_id);
    await answerCallbackQuery(config, cb.id);
    return;
  }

  await answerCallbackQuery(config, cb.id);
};

const handleMessage = async (env: Env, config: RuntimeConfig, message: TelegramMessage): Promise<void> => {
  const chatId = message.chat.id;
  const user = await getOrCreateUser(env.DB, chatId);
  const lang = resolveLang(user.lang);
  await ensureBotCommands(env, config, chatId, lang, message.chat.type);

  if (!ensureMultiuser(config, chatId)) {
    await sendMessage(config, chatId, t(lang, "permission_denied_no_permission"));
    return;
  }

  if (message.document && message.document.file_name?.endsWith(".opml")) {
    await handleOpmlImport(env, config, message, lang);
    return;
  }

  const rawText = message.text || message.caption || "";
  const trimmedText = rawText.trim();
  if (!trimmedText) return;

  if (!trimmedText.startsWith("/") && user.state === USER_STATE_WAITING_SUB_URL) {
    await handleSub(env, config, chatId, trimmedText.split(/\s+/g), lang);
    return;
  }

  const parsed = parseCommand(trimmedText);
  if (!parsed) return;

  const { command, args } = parsed;
  switch (command) {
    case "start":
      await setBotCommands(config, chatId, lang);
      await sendMessage(config, chatId, t(lang, "welcome_prompt"), { disablePreview: true });
      return;
    case "help":
      await setBotCommands(config, chatId, lang);
      await sendMessage(config, chatId, t(lang, isManager(config, chatId) ? "manager_help_msg_html" : "help_msg_html"), { disablePreview: true });
      return;
    case "lang":
      await sendLangPicker(config, chatId, lang);
      return;
    case "sub":
    case "add":
      await handleSub(env, config, chatId, args, lang);
      return;
    case "unsub":
    case "remove":
      await handleUnsub(env, config, chatId, args, lang);
      return;
    case "unsub_all":
    case "remove_all":
      await handleUnsubAll(env, config, chatId, lang);
      return;
    case "list":
      await sendList(env, config, chatId, lang, 1);
      return;
    case "import":
      await sendMessage(config, chatId, t(lang, "send_opml_prompt"));
      return;
    case "export":
      await handleOpmlExport(env, config, chatId, lang);
      return;
    case "set":
      await handleSet(env, config, chatId, args, lang);
      return;
    case "set_default":
      await showUserSettings(env, config, chatId, lang);
      return;
    case "set_interval":
      await handleSetInterval(env, config, chatId, args, lang);
      return;
    case "set_length_limit":
      await handleSetLengthLimit(env, config, chatId, args, lang);
      return;
    case "set_title":
      await handleSetTitle(env, config, chatId, args, lang);
      return;
    case "set_hashtags":
      await handleSetTags(env, config, chatId, args, lang);
      return;
    case "version":
      await sendMessage(config, chatId, "Tg-Rss-Worker");
      return;
    case "set_option":
      if (!isManager(config, chatId)) {
        await sendMessage(config, chatId, t(lang, "permission_denied_not_bot_manager"));
        return;
      }
      await handleSetOption(env, config, chatId, args, lang);
      return;
    case "test":
      if (!isManager(config, chatId)) {
        await sendMessage(config, chatId, t(lang, "permission_denied_not_bot_manager"));
        return;
      }
      await handleTest(env, config, chatId, args, lang);
      return;
    case "user_info":
      if (!isManager(config, chatId)) {
        await sendMessage(config, chatId, t(lang, "permission_denied_not_bot_manager"));
        return;
      }
      await handleUserInfo(env, config, chatId, args, lang);
      return;
    default:
      return;
  }
};

const sendLangPicker = async (config: RuntimeConfig, chatId: number, lang: string): Promise<void> => {
  const buttons = ALL_LANGS.map((code) => [{ text: t(code, "lang_native_name"), callback_data: `set_lang=${code}` }]);
  await sendMessage(config, chatId, t(lang, "select_lang_prompt"), { replyMarkup: { inline_keyboard: buttons } });
};

const handleSub = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length === 0) {
    await updateUserDefaults(env.DB, chatId, { state: USER_STATE_WAITING_SUB_URL });
    await sendMessage(config, chatId, t(lang, "sub_reply_feed_url_prompt_html"));
    return;
  }
  const urls = args.filter((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  if (urls.length === 0) {
    await updateUserDefaults(env.DB, chatId, { state: USER_STATE_WAITING_SUB_URL });
    await sendMessage(config, chatId, t(lang, "sub_reply_feed_url_prompt_html"));
    return;
  }

  await updateUserDefaults(env.DB, chatId, { state: USER_STATE_IDLE });

  const options = await getEffectiveOptions(env, config);
  const user = await getOrCreateUser(env.DB, chatId);
  const countRow = await env.DB.prepare("SELECT COUNT(*) as count FROM sub WHERE user_id = ?1").bind(chatId).first<{ count: number }>();
  const currentCount = countRow?.count ?? 0;
  const limit = user.sub_limit ?? (chatId < 0 ? options.channel_or_group_sub_limit : options.user_sub_limit);
  if (limit > 0 && currentCount >= limit) {
    await sendMessage(config, chatId, formatTemplate(t(lang, "sub_limit_reached_prompt"), currentCount, limit));
    return;
  }
  const successes: string[] = [];
  const failures: string[] = [];

  for (const url of urls) {
    let feed = await getFeedByLink(env.DB, url);
    let finalUrl = url;
    if (!feed) {
      const result = await fetchFeed(url, config);
      if (!result.feed) {
        if (result.content) {
          const sniffed = await trySniffFeed(env, url, result.content);
          if (sniffed) {
            const sniffResult = await fetchFeed(sniffed, config);
            if (sniffResult.feed) {
              finalUrl = sniffResult.url;
              feed = await getFeedByLink(env.DB, finalUrl);
              if (!feed) {
                feed = await createFeed(env.DB, finalUrl, sniffResult.feed.title || finalUrl);
              }
            }
          }
        }
      } else {
        finalUrl = result.url;
        feed = await getFeedByLink(env.DB, finalUrl);
        if (!feed) {
          feed = await createFeed(env.DB, finalUrl, result.feed.title || finalUrl);
        }
      }
    }
    if (!feed) {
      failures.push(`${url}`);
      continue;
    }
    const sub = await getSubByUserFeed(env.DB, chatId, feed.id);
    if (sub && sub.state === 1) {
      failures.push(`${feed.link}`);
      continue;
    }
    if (!sub) {
      await createSub(env.DB, chatId, feed.id, null);
    } else {
      await updateSub(env.DB, sub.id, { state: 1 });
    }
    await updateFeedInterval(env.DB, feed.id, options);
    successes.push(formatFeedLabel(feed.title, feed.link));
  }

  const msg = [
    successes.length ? `<b>${t(lang, "sub_successful")}</b>\n${successes.join("\n")}` : "",
    failures.length ? `<b>${t(lang, "sub_failed")}</b>\n${failures.map((url) => escapeHtml(url)).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");

  await sendMessage(config, chatId, msg || t(lang, "internal_error"));
};

const handleUnsub = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length === 0) {
    await sendList(env, config, chatId, lang, 1);
    return;
  }
  const target = args[0];
  if (target.match(/^\d+$/)) {
    const subId = Number(target);
    const sub = await env.DB.prepare("SELECT * FROM sub WHERE id = ?1").bind(subId).first<any>();
    if (sub) {
      await deleteSub(env.DB, subId);
      const options = await getEffectiveOptions(env, config);
      await updateFeedInterval(env.DB, sub.feed_id, options);
    }
    await sendMessage(config, chatId, t(lang, "unsub_successful"));
    return;
  }
  const feed = await getFeedByLink(env.DB, target);
  if (!feed) {
    await sendMessage(config, chatId, t(lang, "subscription_not_exist"));
    return;
  }
  await deleteSubByUserFeed(env.DB, chatId, feed.id);
  const options = await getEffectiveOptions(env, config);
  await updateFeedInterval(env.DB, feed.id, options);
  await sendMessage(config, chatId, t(lang, "unsub_successful"));
};

const handleUnsubAll = async (env: Env, config: RuntimeConfig, chatId: number, lang: string): Promise<void> => {
  await deleteAllSubs(env.DB, chatId);
  await sendMessage(config, chatId, t(lang, "unsub_all_successful"));
};

const sendList = async (env: Env, config: RuntimeConfig, chatId: number, lang: string, page: number, messageId?: number): Promise<void> => {
  const { total, subs } = await listSubsByUser(env.DB, chatId, page, PAGE_SIZE);
  if (total === 0) {
    await sendMessage(config, chatId, t(lang, "no_subscription"));
    return;
  }
  const text = subs.map((sub) => `<a href=\"${sub.feed_link}\">${escapeHtml(sub.title || sub.feed_title)}</a>`).join("\n");
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const buttons = [
    [
      { text: "<", callback_data: `list|${Math.max(1, page - 1)}` },
      { text: `${page}/${pageCount}`, callback_data: "noop" },
      { text: ">", callback_data: `list|${Math.min(pageCount, page + 1)}` }
    ]
  ];
  if (messageId) {
    await editMessageText(config, chatId, messageId, text, { replyMarkup: { inline_keyboard: buttons } });
  } else {
    await sendMessage(config, chatId, text, { replyMarkup: { inline_keyboard: buttons } });
  }
};

const handleOpmlImport = async (env: Env, config: RuntimeConfig, message: TelegramMessage, lang: string): Promise<void> => {
  if (!message.document?.file_id) return;
  const file = await getFile(config, message.document.file_id);
  const buffer = await downloadFile(config, file.file_path);
  const xml = new TextDecoder().decode(buffer);
  const feeds = parseOpml(xml);
  if (!feeds.length) {
    await sendMessage(config, message.chat.id, t(lang, "opml_parse_error"));
    return;
  }
  const urls = feeds.map((feed) => feed.url);
  await handleSub(env, config, message.chat.id, urls, lang);
};

const handleOpmlExport = async (env: Env, config: RuntimeConfig, chatId: number, lang: string): Promise<void> => {
  const { subs } = await listSubsByUser(env.DB, chatId, 1, 1000);
  if (!subs.length) {
    await sendMessage(config, chatId, t(lang, "no_subscription"));
    return;
  }
  const opml = buildOpml(subs.map((sub) => ({ url: sub.feed_link, title: sub.title || sub.feed_title })));
  await sendDocument(config, chatId, opml, `RSStT_export_${Date.now()}.opml`);
};

const handleSet = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length === 0) {
    await sendListForSet(env, config, chatId, lang, 1);
    return;
  }
  const subId = Number(args[0]);
  if (!Number.isFinite(subId)) {
    await sendListForSet(env, config, chatId, lang, 1);
    return;
  }
  await showSubSettings(env, config, chatId, subId, lang);
};

const sendListForSet = async (env: Env, config: RuntimeConfig, chatId: number, lang: string, page: number): Promise<void> => {
  const { total, subs } = await listSubsByUser(env.DB, chatId, page, PAGE_SIZE);
  if (total === 0) {
    await sendMessage(config, chatId, t(lang, "no_subscription"));
    return;
  }
  const buttons = subs.map((sub) => [{ text: sub.title || sub.feed_title, callback_data: `set=${sub.id}` }]);
  await sendMessage(config, chatId, t(lang, "set_choose_sub_prompt"), { replyMarkup: { inline_keyboard: buttons } });
};

const showSubSettings = async (env: Env, config: RuntimeConfig, chatId: number, subId: number, lang: string, messageId?: number): Promise<void> => {
  const sub = await env.DB.prepare("SELECT * FROM sub WHERE id = ?1").bind(subId).first<any>();
  if (!sub) {
    await sendMessage(config, chatId, t(lang, "subscription_not_exist"));
    return;
  }
  const feed = await env.DB.prepare("SELECT * FROM feed WHERE id = ?1").bind(sub.feed_id).first<any>();
  const user = await getUser(env.DB, sub.user_id);
  const text = `${t(lang, "subscription_info")}\n\n${t(lang, "feed_title")}: ${feed?.title}\n${t(lang, "feed_url")}: ${feed?.link}`;
  const buttons = buildToggleButtons(subId, sub, lang, false, user || undefined);
  if (messageId) {
    await editMessageText(config, chatId, messageId, text, { replyMarkup: { inline_keyboard: buttons } });
  } else {
    await sendMessage(config, chatId, text, { replyMarkup: { inline_keyboard: buttons } });
  }
};

const showUserSettings = async (env: Env, config: RuntimeConfig, chatId: number, lang: string, messageId?: number): Promise<void> => {
  const user = await getUser(env.DB, chatId);
  if (!user) return;
  const text = t(lang, "set_user_default_description");
  const buttons = buildToggleButtons(chatId, user, lang, true);
  if (messageId) {
    await editMessageText(config, chatId, messageId, text, { replyMarkup: { inline_keyboard: buttons } });
  } else {
    await sendMessage(config, chatId, text, { replyMarkup: { inline_keyboard: buttons } });
  }
};

const buildToggleButtons = (
  id: number,
  entity: any,
  lang: string,
  isUser: boolean,
  userDefaults?: any
): Array<Array<{ text: string; callback_data: string }>> => {
  const row = (label: string, key: string) => [{ text: label, callback_data: `${isUser ? "set_default" : "toggle"}=${id}:${key}` }];
  const resolve = (value: number, key: string) => {
    if (!isUser && value === -100 && userDefaults) return userDefaults[key] as number;
    return value;
  };
  return [
    row(`${t(lang, "notification")}: ${valueLabel(lang, "notify", resolve(entity.notify, "notify"))}`, "notify"),
    row(`${t(lang, "send_mode")}: ${valueLabel(lang, "send_mode", resolve(entity.send_mode, "send_mode"))}`, "send_mode"),
    row(`${t(lang, "link_preview")}: ${valueLabel(lang, "link_preview", resolve(entity.link_preview, "link_preview"))}`, "link_preview"),
    row(`${t(lang, "display_media")}: ${valueLabel(lang, "display_media", resolve(entity.display_media, "display_media"))}`, "display_media"),
    row(`${t(lang, "display_title")}: ${valueLabel(lang, "display_title", resolve(entity.display_title, "display_title"))}`, "display_title"),
    row(`${t(lang, "display_author")}: ${valueLabel(lang, "display_author", resolve(entity.display_author, "display_author"))}`, "display_author"),
    row(`${t(lang, "display_via")}: ${valueLabel(lang, "display_via", resolve(entity.display_via, "display_via"))}`, "display_via"),
    row(`${t(lang, "display_entry_tags")}: ${valueLabel(lang, "display_entry_tags", resolve(entity.display_entry_tags, "display_entry_tags"))}`, "display_entry_tags"),
    row(`${t(lang, "style")}: ${valueLabel(lang, "style", resolve(entity.style, "style"))}`, "style")
  ];
};

const toggleSubOption = async (env: Env, subId: number, key: string): Promise<void> => {
  const sub = await env.DB.prepare("SELECT * FROM sub WHERE id = ?1").bind(subId).first<any>();
  if (!sub) return;
  const next = nextValue(key, sub[key]);
  await updateSub(env.DB, subId, { [key]: next } as any);
};

const toggleUserDefault = async (env: Env, userId: number, key: string): Promise<void> => {
  const user = await getUser(env.DB, userId);
  if (!user) return;
  const next = nextValue(key, (user as any)[key]);
  await updateUserDefaults(env.DB, userId, { [key]: next } as any);
};

const nextValue = (key: string, current: number): number => {
  const options: Record<string, number[]> = {
    notify: [1, 0],
    send_mode: [0, 1, 2, -1],
    link_preview: [0, 1, -1],
    display_media: [0, 1, -1],
    display_author: [0, 1, -1],
    display_via: [0, 1, -3, -1, -4, -2],
    display_title: [0, 1, -1],
    display_entry_tags: [1, -1],
    style: [0, 1]
  };
  const values = options[key] || [current];
  const idx = values.indexOf(current);
  return values[(idx + 1) % values.length];
};

const valueLabel = (lang: string, key: string, value: number): string => {
  if (key === "notify") {
    return t(lang, value === 1 ? "notification_normal" : "notification_muted");
  }
  return t(lang, `${key}_${value}`);
};

const handleSetInterval = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length < 2) {
    await sendMessage(config, chatId, t(lang, "set_interval_prompt"));
    return;
  }
  const subId = Number(args[0]);
  const interval = Number(args[1]);
  if (!Number.isFinite(subId) || !Number.isFinite(interval)) {
    await sendMessage(config, chatId, t(lang, "action_invalid"));
    return;
  }
  await updateSub(env.DB, subId, { interval });
  await sendMessage(config, chatId, formatTemplate(t(lang, "set_interval_success_html"), interval), { disablePreview: true });
};

const handleSetLengthLimit = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length < 2) {
    await sendMessage(config, chatId, t(lang, "set_length_limit_prompt"));
    return;
  }
  const subId = Number(args[0]);
  const length = Number(args[1]);
  if (!Number.isFinite(subId) || !Number.isFinite(length)) {
    await sendMessage(config, chatId, t(lang, "action_invalid"));
    return;
  }
  await updateSub(env.DB, subId, { length_limit: length });
  await sendMessage(config, chatId, formatTemplate(t(lang, "set_length_limit_success_html"), length), { disablePreview: true });
};

const handleSetTitle = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length < 2) {
    await sendMessage(config, chatId, t(lang, "cmd_set_title_usage_prompt_html"), { disablePreview: true });
    return;
  }
  const subId = Number(args[0]);
  const title = args.slice(1).join(" ").trim();
  await updateSub(env.DB, subId, { title: title || null });
  await sendMessage(config, chatId, title ? `${t(lang, "set_title_success")}${title}` : t(lang, "set_title_success_cleared"));
};

const handleSetTags = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length < 2) {
    await sendMessage(config, chatId, t(lang, "cmd_set_hashtags_usage_prompt_html"), { disablePreview: true });
    return;
  }
  const subId = Number(args[0]);
  const tags = args.slice(1).join(" ").trim();
  await updateSub(env.DB, subId, { tags: tags || null });
  await sendMessage(config, chatId, tags ? `${t(lang, "set_hashtags_success_html")}${tags}` : t(lang, "set_hashtags_success_cleared"));
};

const handleSetOption = async (env: Env, _config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length < 2) {
    await sendMessage(_config, chatId, t(lang, "cmd_set_option_usage_prompt_html"));
    return;
  }
  const key = args[0];
  const value = args.slice(1).join(" ");
  await setOption(env.DB, key, value);
  await sendMessage(_config, chatId, t(lang, "option_updated"));
};

const handleTest = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  if (args.length === 0) {
    await sendMessage(config, chatId, t(lang, "cmd_test_usage_prompt_html"));
    return;
  }
  const url = args[0];
  const result = await fetchFeed(url, config);
  if (!result.feed || result.feed.entries.length === 0) {
    await sendMessage(config, chatId, t(lang, "internal_error"));
    return;
  }
  const entry = result.feed.entries[0];
  const feedRow = { id: 0, link: result.url, title: result.feed.title, interval: null, etag: null, last_modified: null, error_count: 0, next_check_time: null, lock_until: null, state: 1 };
  const user = await getOrCreateUser(env.DB, chatId);
  const formatting = resolveFormatting({
    id: 0,
    state: 1,
    user_id: chatId,
    feed_id: 0,
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
  }, user, 10);
  const formatted = await formatPost(entry, feedRow, formatting, config);
  if (!formatted) {
    await sendMessage(config, chatId, t(lang, "internal_error"));
    return;
  }
  await sendFormattedPost(config, chatId, formatted.html, formatted.media, {
    disableNotification: formatting.notify === 0,
    needMedia: formatted.needMedia,
    needLinkPreview: formatted.needLinkPreview
  });
};

const handleUserInfo = async (env: Env, config: RuntimeConfig, chatId: number, args: string[], lang: string): Promise<void> => {
  const targetId = args.length ? Number(args[0]) : chatId;
  if (!Number.isFinite(targetId)) {
    await sendMessage(config, chatId, t(lang, "user_not_found"));
    return;
  }
  const user = await getUser(env.DB, targetId);
  if (!user) {
    await sendMessage(config, chatId, t(lang, "user_not_found"));
    return;
  }
  const countRow = await env.DB.prepare("SELECT COUNT(*) as count FROM sub WHERE user_id = ?1").bind(targetId).first<{ count: number }>();
  const msg = `${t(lang, "user_info")}\n${targetId}\n${t(lang, "sub_count")}: ${countRow?.count ?? 0}`;
  await sendMessage(config, chatId, msg);
};

const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatTemplate = (template: string, ...values: Array<string | number>): string => {
  let idx = 0;
  return template.replace(/%[ds]/g, () => String(values[idx++] ?? ""));
};

const formatFeedLabel = (title: string | undefined, link: string): string => {
  const safeTitle = title ? escapeHtml(title) : "";
  const safeLink = escapeHtml(link);
  if (safeTitle) {
    return `<a href=\"${safeLink}\">${safeTitle}</a>`;
  }
  return safeLink;
};

const ensureBotCommands = async (env: Env, config: RuntimeConfig, chatId: number, lang: string, chatType?: string): Promise<void> => {
  if (chatType !== "private") return;
  const key = `bot_commands:${chatId}:${lang}`;
  const cached = await env.KV.get(key);
  if (cached) return;
  try {
    await setBotCommands(config, chatId, lang);
    await env.KV.put(key, "1", { expirationTtl: 60 * 60 * 24 });
  } catch {
    // Ignore command setup failures to avoid blocking message handling.
  }
};

export const setBotCommands = async (config: RuntimeConfig, chatId: number, lang: string): Promise<void> => {
  const commands = buildCommandsList(lang, isManager(config, chatId));
  await telegramFetch(config, "setMyCommands", {
    commands,
    scope: { type: "chat", chat_id: chatId },
    language_code: normalizeLangCode(lang)
  });
};

const normalizeLangCode = (lang: string): string => {
  return lang.replace(/_/g, "-").toLowerCase();
};
