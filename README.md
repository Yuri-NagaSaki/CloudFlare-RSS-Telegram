# Cloudflare RSS → Telegram Worker

## 目录
- `src/` Worker 代码
- `src/db/schema.sql` D1 表结构
- `fixtures/` 测试用 RSS 样本
- `tests/` 单元测试

## 初始化

1) 安装依赖
```
pnpm install
```

2) 创建 D1 / KV
```
wrangler d1 create TgRss-D1
wrangler kv:namespace create TgRss-KV
```
把输出的 `database_id`/`kv id` 填入 `wrangler.toml`。

3) 初始化数据库
```
wrangler d1 execute TgRss-D1 --file src/db/schema.sql
```

4) 设置 Secrets
```
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put TELEGRAPH_TOKEN
```

5) 可选 Vars
```
wrangler kv:namespace list
```
以及 `wrangler.toml` 中的 `vars`。

### 关键变量说明
- `TELEGRAM_BOT_TOKEN`：Bot Token（必须）
- `TELEGRAM_WEBHOOK_SECRET`：Webhook secret（建议）
- `TELEGRAM_ADMIN_IDS`：管理员 ID 列表（逗号分隔）
- `TELEGRAPH_TOKEN`：Telegraph token（可选）
- `MULTIUSER`：是否允许非管理员使用（默认 true）

## 部署
```
wrangler deploy
```

## Webhook
部署后使用 Telegram Bot API 设置 webhook:
```
https://api.telegram.org/bot<token>/setWebhook?url=<worker_url>/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

## 测试
```
pnpm test
```
