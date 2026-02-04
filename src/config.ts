export type Env = {
  DB: D1Database;
  KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_IDS?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAPH_TOKEN?: string;
  MULTIUSER?: string;
  DEFAULT_INTERVAL?: string;
  MINIMAL_INTERVAL?: string;
  USER_SUB_LIMIT?: string;
  CHANNEL_SUB_LIMIT?: string;
  IMG_RELAY_SERVER?: string;
  IMAGES_WESERV_NL?: string;
};

export type RuntimeConfig = {
  botToken: string;
  webhookSecret?: string;
  adminIds: Set<number>;
  multiuser: boolean;
  defaultInterval: number;
  minimalInterval: number;
  userSubLimit: number;
  channelSubLimit: number;
  imgRelayServer: string;
  imagesWeserv: string;
  telegraphToken?: string;
  defaultAdminChatId?: number;
};

export const getConfig = (env: Env): RuntimeConfig => {
  const adminIds = new Set<number>();
  if (env.TELEGRAM_ADMIN_IDS) {
    for (const raw of env.TELEGRAM_ADMIN_IDS.split(/[,\s]+/g)) {
      if (!raw) continue;
      const id = Number(raw);
      if (!Number.isNaN(id)) adminIds.add(id);
    }
  }
  const defaultAdminChatId = env.TELEGRAM_CHAT_ID ? Number(env.TELEGRAM_CHAT_ID) : undefined;
  if (defaultAdminChatId && !Number.isNaN(defaultAdminChatId)) {
    adminIds.add(defaultAdminChatId);
  }

  const defaultInterval = toInt(env.DEFAULT_INTERVAL, 10);
  const minimalInterval = Math.max(1, toInt(env.MINIMAL_INTERVAL, 5));
  const userSubLimit = toInt(env.USER_SUB_LIMIT, -1);
  const channelSubLimit = toInt(env.CHANNEL_SUB_LIMIT, -1);

  return {
    botToken: env.TELEGRAM_BOT_TOKEN,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    adminIds,
    multiuser: toBool(env.MULTIUSER, true),
    defaultInterval,
    minimalInterval,
    userSubLimit,
    channelSubLimit,
    imgRelayServer: normalizeUrl(env.IMG_RELAY_SERVER || "https://rsstt-img-relay.rongrong.workers.dev/"),
    imagesWeserv: normalizeUrl(env.IMAGES_WESERV_NL || "https://wsrv.nl/"),
    telegraphToken: env.TELEGRAPH_TOKEN,
    defaultAdminChatId: defaultAdminChatId && !Number.isNaN(defaultAdminChatId) ? defaultAdminChatId : undefined
  };
};

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
  return fallback;
};

const toInt = (value: string | undefined, fallback: number): number => {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeUrl = (value: string): string => {
  if (!value) return value;
  const withProto = value.startsWith("http") ? value : `https://${value}`;
  return withProto.endsWith("/") ? withProto : `${withProto}/`;
};
