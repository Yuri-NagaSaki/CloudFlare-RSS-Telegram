import { decode } from "he";

export const getPlainTextLength = (html: string): number => htmlToPlainText(html).length;

export const htmlToPlainText = (html: string): string => {
  if (!html) return "";
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decode(stripped);
};

export const splitHtml = (html: string, maxLen: number): Array<string> => {
  if (html.length <= maxLen) return [html];
  const parts = html.split(/\n+/);
  const chunks: Array<string> = [];
  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current}\n${part}` : part;
    if (candidate.length > maxLen) {
      if (current) chunks.push(current);
      if (part.length > maxLen) {
        for (let i = 0; i < part.length; i += maxLen) {
          chunks.push(part.slice(i, i + maxLen));
        }
        current = "";
      } else {
        current = part;
      }
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

