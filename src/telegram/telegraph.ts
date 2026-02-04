import type { RuntimeConfig } from "../config";

export const createTelegraphPage = async (config: RuntimeConfig, title: string, html: string): Promise<string | null> => {
  if (!config.telegraphToken) return null;
  const response = await fetch("https://api.telegra.ph/createPage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: config.telegraphToken,
      title,
      content: [{ tag: "p", children: [html] }],
      return_content: false
    })
  });
  const data = (await response.json()) as { ok: boolean; result?: { url: string } };
  if (!data.ok || !data.result?.url) return null;
  return data.result.url;
};
