import { getConfig, type Env } from "./config";
import { handleUpdate } from "./commands/handler";
import { runMonitor } from "./rss/monitor";

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    if (url.pathname === "/webhook" && request.method === "POST") {
      const config = getConfig(env);
      if (config.webhookSecret) {
        const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (secret !== config.webhookSecret) {
          return new Response("forbidden", { status: 403 });
        }
      }
      const update = await request.json();
      ctx.waitUntil(handleUpdate(env, config, update));
      return jsonResponse({ ok: true });
    }
    return new Response("not found", { status: 404 });
  },

  async scheduled(_: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const config = getConfig(env);
    ctx.waitUntil(runMonitor(env, config));
  }
};
