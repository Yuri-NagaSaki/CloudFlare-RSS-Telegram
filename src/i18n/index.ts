// Auto-generated i18n index
import ar from './ar.json';
import be from './be.json';
import ca from './ca.json';
import cs from './cs.json';
import de from './de.json';
import el from './el.json';
import en from './en.json';
import es from './es.json';
import eu from './eu.json';
import fa from './fa.json';
import fr from './fr.json';
import he from './he.json';
import id from './id.json';
import it from './it.json';
import ja from './ja.json';
import ko from './ko.json';
import lv from './lv.json';
import pl from './pl.json';
import pt_BR from './pt-BR.json';
import pt from './pt.json';
import ru from './ru.json';
import si from './si.json';
import ta from './ta.json';
import tr from './tr.json';
import uk from './uk.json';
import uz from './uz.json';
import yue from './yue.json';
import zh_Hans from './zh-Hans.json';
import zh_Hant from './zh-Hant.json';

export type I18nDict = Record<string, string>;
const normalizeDict = (dict: Record<string, unknown>): I18nDict => {
  const merged: Record<string, unknown> = { ...dict };
  for (const value of Object.values(dict)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        if (!(subKey in merged)) {
          merged[subKey] = subVal;
        }
      }
    }
  }
  return merged as I18nDict;
};

export const i18n: Record<string, I18nDict> = {
  'ar': normalizeDict(ar as unknown as Record<string, unknown>),
  'be': normalizeDict(be as unknown as Record<string, unknown>),
  'ca': normalizeDict(ca as unknown as Record<string, unknown>),
  'cs': normalizeDict(cs as unknown as Record<string, unknown>),
  'de': normalizeDict(de as unknown as Record<string, unknown>),
  'el': normalizeDict(el as unknown as Record<string, unknown>),
  'en': normalizeDict(en as unknown as Record<string, unknown>),
  'es': normalizeDict(es as unknown as Record<string, unknown>),
  'eu': normalizeDict(eu as unknown as Record<string, unknown>),
  'fa': normalizeDict(fa as unknown as Record<string, unknown>),
  'fr': normalizeDict(fr as unknown as Record<string, unknown>),
  'he': normalizeDict(he as unknown as Record<string, unknown>),
  'id': normalizeDict(id as unknown as Record<string, unknown>),
  'it': normalizeDict(it as unknown as Record<string, unknown>),
  'ja': normalizeDict(ja as unknown as Record<string, unknown>),
  'ko': normalizeDict(ko as unknown as Record<string, unknown>),
  'lv': normalizeDict(lv as unknown as Record<string, unknown>),
  'pl': normalizeDict(pl as unknown as Record<string, unknown>),
  'pt-BR': normalizeDict(pt_BR as unknown as Record<string, unknown>),
  'pt': normalizeDict(pt as unknown as Record<string, unknown>),
  'ru': normalizeDict(ru as unknown as Record<string, unknown>),
  'si': normalizeDict(si as unknown as Record<string, unknown>),
  'ta': normalizeDict(ta as unknown as Record<string, unknown>),
  'tr': normalizeDict(tr as unknown as Record<string, unknown>),
  'uk': normalizeDict(uk as unknown as Record<string, unknown>),
  'uz': normalizeDict(uz as unknown as Record<string, unknown>),
  'yue': normalizeDict(yue as unknown as Record<string, unknown>),
  'zh-Hans': normalizeDict(zh_Hans as unknown as Record<string, unknown>),
  'zh-Hant': normalizeDict(zh_Hant as unknown as Record<string, unknown>),
};

export const ALL_LANGS = Object.keys(i18n);

export const getLang = (lang: string | undefined, fallback: string = "zh-Hans"): string => {
  if (!lang) return fallback;
  return i18n[lang] ? lang : fallback;
};

export const t = (lang: string, key: string): string => {
  const dict = i18n[lang] || i18n["zh-Hans"];
  return (dict && dict[key]) || (i18n["en"] && i18n["en"][key]) || key;
};

export const getRaw = <T = unknown>(lang: string, key: string): T | undefined => {
  const dict = i18n[lang] || i18n["zh-Hans"];
  return (dict as unknown as Record<string, T>)[key];
};
