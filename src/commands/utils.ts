import type { RuntimeConfig } from "../config";
import type { Env } from "../config";
import { t, getLang, getRaw } from "../i18n";
import { loadOptions } from "../db/queries";

export const parseCommand = (text: string): { command: string; args: string[] } | null => {
  if (!text.startsWith("/")) return null;
  const parts = text.trim().split(/\s+/g);
  const raw = parts[0].slice(1);
  const command = raw.split("@")[0];
  return { command, args: parts.slice(1) };
};

export const isManager = (config: RuntimeConfig, chatId: number): boolean => {
  return config.adminIds.has(chatId);
};

export const ensureMultiuser = (config: RuntimeConfig, chatId: number): boolean => {
  if (config.multiuser) return true;
  return isManager(config, chatId);
};

export const resolveLang = (lang?: string): string => getLang(lang);

export const buildCommandsList = (lang: string, manager: boolean): Array<{ command: string; description: string }> => {
  const dictKey = "l10n_cmd_descriptions";
  const descriptions = getRaw<Record<string, string>>(lang, dictKey) || {};
  const pick = (key: string) => (descriptions && descriptions[key]) || key;
  const commands = [
    { command: "sub", description: pick("cmd_description_sub") },
    { command: "unsub", description: pick("cmd_description_unsub") },
    { command: "unsub_all", description: pick("cmd_description_unsub_all") },
    { command: "list", description: pick("cmd_description_list") },
    { command: "set", description: pick("cmd_description_set") },
    { command: "set_default", description: pick("cmd_description_set_default") },
    { command: "import", description: pick("cmd_description_import") },
    { command: "export", description: pick("cmd_description_export") },
    { command: "version", description: pick("cmd_description_version") },
    { command: "lang", description: pick("cmd_description_lang") },
    { command: "help", description: pick("cmd_description_help") }
  ];
  if (manager) {
    commands.push({ command: "test", description: pick("cmd_description_test") });
    commands.push({ command: "set_option", description: pick("cmd_description_set_option") });
    commands.push({ command: "user_info", description: pick("cmd_description_user_info") });
  }
  return commands;
};

export const getEffectiveOptions = async (env: Env, config: RuntimeConfig) => {
  return loadOptions(env.DB, config);
};
