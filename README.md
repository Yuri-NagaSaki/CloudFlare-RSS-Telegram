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
wrangler d1 create <数据库名>
wrangler kv namespace create <KV名>
```
把输出的 `database_id` / `id` 填入 `wrangler.toml`。

3) 修改 `wrangler.toml`

| 字段 | 说明 |
|------|------|
| `name` | Worker 名称，决定 `<name>.<subdomain>.workers.dev` 域名 |
| `TELEGRAM_ADMIN_IDS` | 管理员 ID（逗号分隔，支持用户 ID 和群组 ID） |
| `MULTIUSER` | 是否允许非管理员使用（默认 `true`） |
| `database_name` / `database_id` | D1 数据库名称和 ID（来自步骤 2） |
| KV `id` | KV 命名空间 ID（来自步骤 2） |

4) 初始化数据库
```
wrangler d1 execute <数据库名> --remote --file src/db/schema.sql
```
> **注意**：必须加 `--remote`，否则只会写入本地开发数据库。

5) 设置 Secrets
```
echo "<token>" | wrangler secret put TELEGRAM_BOT_TOKEN
```

可选：
```
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put TELEGRAPH_TOKEN
```

### 关键变量说明
- `TELEGRAM_BOT_TOKEN`：Bot Token（必须）
- `TELEGRAM_WEBHOOK_SECRET`：Webhook secret（建议）
- `TELEGRAM_ADMIN_IDS`：管理员 ID 列表（逗号分隔）
- `TELEGRAPH_TOKEN`：Telegraph token（可选）
- `MULTIUSER`：是否允许非管理员使用（默认 `true`）

## 部署
```
wrangler deploy
```

## Webhook
部署后使用 Telegram Bot API 设置 webhook：
```
https://api.telegram.org/bot<token>/setWebhook?url=https://<worker名>.<subdomain>.workers.dev/webhook
```

> Worker 的实际域名以 `wrangler deploy` 输出为准（例如 `https://lazy-rss.asukas.workers.dev`）。

### 注册命令菜单

首次部署后需要手动注册一次全局命令，否则用户在 Telegram 中看不到命令菜单：

```
curl "https://api.telegram.org/bot<token>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command":"sub","description":"订阅"},
      {"command":"unsub","description":"退订"},
      {"command":"unsub_all","description":"退订所有"},
      {"command":"list","description":"查看订阅列表"},
      {"command":"set","description":"设置订阅"},
      {"command":"set_default","description":"设置默认选项"},
      {"command":"import","description":"导入OPML"},
      {"command":"export","description":"导出OPML"},
      {"command":"version","description":"查看版本"},
      {"command":"lang","description":"切换语言"},
      {"command":"help","description":"帮助"}
    ]
  }'
```

之后用户发送 `/start` 或 `/help` 时，bot 会自动按聊天维度更新命令列表。

## 验证

```bash
# 检查 D1 表是否创建成功
wrangler d1 execute <数据库名> --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# 检查 webhook 状态
curl "https://api.telegram.org/bot<token>/getWebhookInfo"

# 检查命令是否注册
curl "https://api.telegram.org/bot<token>/getMyCommands"
```

## 测试
```
pnpm test
```

## 部署踩坑记录

### 1. D1 初始化缺少 `--remote`

`wrangler d1 execute` 默认操作本地数据库。部署到 Cloudflare 后 Worker 访问的是远程 D1，如果初始化时忘了 `--remote`，远程数据库为空，所有数据库操作会静默失败。

### 2. Telegram 命令菜单不显示

`setBotCommands` 原实现在调用 `setMyCommands` API 时传了 `language_code` 参数。该参数要求 **两位 ISO 639-1 语言代码**（如 `zh`、`en`），但代码中 `normalizeLangCode` 将 `zh-Hans` 转为 `zh-hans`——这不是合法的两位代码，Telegram 会静默接受但不会匹配任何用户的语言设置，导致命令菜单始终为空。

**修复**：从 `setBotCommands` 中移除 `language_code` 参数，命令对所有语言生效。

### 3. 命令需要手动全局注册

代码中的 `setBotCommands` 使用 `scope: { type: "chat", chat_id }` 按聊天维度注册命令，仅在用户发送第一条消息后才触发。首次部署后如果没有全局注册，新用户打开 bot 看不到任何命令菜单。

**解决**：部署后手动调用一次 `setMyCommands`（不带 `scope`）注册全局命令（见上方"注册命令菜单"章节）。
