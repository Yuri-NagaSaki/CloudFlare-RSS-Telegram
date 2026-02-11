# Cloudflare RSS → Telegram Worker

## 目录
- `src/` Worker 代码
- `src/db/schema.sql` D1 表结构
- `fixtures/` 测试用 RSS 样本
- `tests/` 单元测试

## 一键部署（Fork 用户推荐）

Fork 本仓库后，只需在 GitHub Secrets 中填入配置，触发 Action 即可自动完成全部部署。

### 1) 准备 Cloudflare 资源

在 Cloudflare Dashboard 中手动创建：

```bash
# 创建 D1 数据库
wrangler d1 create rss-db

# 创建 KV 命名空间
wrangler kv namespace create KV
```

记下输出的 `database_id` 和 KV `id`。

### 2) 配置 GitHub Secrets

进入 Fork 仓库的 **Settings → Secrets and variables → Actions**，添加以下 Secrets：

| Secret | 必填 | 说明 |
|--------|------|------|
| `CLOUDFLARE_API_TOKEN` | 是 | Cloudflare API Token（需要 Workers 和 D1 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | Cloudflare Account ID |
| `TELEGRAM_BOT_TOKEN` | 是 | Telegram Bot Token（从 @BotFather 获取） |
| `TELEGRAM_ADMIN_IDS` | 是 | 管理员 ID（逗号分隔，支持用户 ID 和群组 ID） |
| `D1_DATABASE_ID` | 是 | D1 数据库 ID（来自步骤 1） |
| `KV_NAMESPACE_ID` | 是 | KV 命名空间 ID（来自步骤 1） |
| `WORKER_NAME` | 否 | Worker 名称（默认 `tg-rss-worker`） |
| `TELEGRAM_WEBHOOK_SECRET` | 否 | Webhook 验证 secret（建议设置） |
| `TELEGRAPH_TOKEN` | 否 | Telegraph token（用于长文推送） |
| `MULTIUSER` | 否 | 是否允许非管理员使用（默认 `false`） |
| `DEFAULT_INTERVAL` | 否 | 默认检查间隔，分钟（默认 `5`） |
| `MINIMAL_INTERVAL` | 否 | 最小检查间隔，分钟（默认 `5`） |
| `USER_SUB_LIMIT` | 否 | 用户订阅数上限（默认 `-1` 无限制） |
| `CHANNEL_SUB_LIMIT` | 否 | 频道订阅数上限（默认 `-1` 无限制） |

### 3) 触发部署

进入 **Actions → Deploy → Run workflow**，手动触发一次即可。

Deploy workflow 会自动完成：
- 生成 `wrangler.toml`
- 初始化 D1 数据库表结构
- 部署 Worker
- 设置 Worker Secrets
- 配置 Telegram Webhook
- 注册 Bot 命令菜单

之后每次 push 到 main 分支也会自动部署。

### 4) 自动同步上游更新

Fork 仓库会每天 UTC 04:00 自动同步上游更新。如果检测到变更，会自动重新部署。

也可以在 **Actions → Sync Upstream → Run workflow** 手动触发同步。

> **注意**：同步使用 `--force`，会覆盖 main 分支上的本地修改。Fork 用户不应直接修改 main 分支代码。

## 手动部署

如果不使用 GitHub Actions，可以手动部署：

### 1) 安装依赖
```
pnpm install
```

### 2) 创建 D1 / KV
```
wrangler d1 create <数据库名>
wrangler kv namespace create <KV名>
```
把输出的 `database_id` / `id` 填入 `wrangler.toml`。

### 3) 修改 `wrangler.toml`

| 字段 | 说明 |
|------|------|
| `name` | Worker 名称，决定 `<name>.<subdomain>.workers.dev` 域名 |
| `TELEGRAM_ADMIN_IDS` | 管理员 ID（逗号分隔，支持用户 ID 和群组 ID） |
| `MULTIUSER` | 是否允许非管理员使用（默认 `true`） |
| `database_name` / `database_id` | D1 数据库名称和 ID（来自步骤 2） |
| KV `id` | KV 命名空间 ID（来自步骤 2） |

### 4) 初始化数据库
```
wrangler d1 execute <数据库名> --remote --file src/db/schema.sql
```
> **注意**：必须加 `--remote`，否则只会写入本地开发数据库。

### 5) 设置 Secrets
```
echo "<token>" | wrangler secret put TELEGRAM_BOT_TOKEN
```

可选：
```
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put TELEGRAPH_TOKEN
```

### 6) 部署
```
wrangler deploy
```

### 7) 设置 Webhook
```
https://api.telegram.org/bot<token>/setWebhook?url=https://<worker名>.<subdomain>.workers.dev/webhook
```

> Worker 的实际域名以 `wrangler deploy` 输出为准。

### 8) 注册命令菜单

首次部署后需要手动注册一次全局命令：

```
curl "https://api.telegram.org/bot<token>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command":"sub","description":"Subscribe"},
      {"command":"unsub","description":"Unsubscribe"},
      {"command":"unsub_all","description":"Unsubscribe from all subscriptions"},
      {"command":"list","description":"Check the subscription list"},
      {"command":"set","description":"Customize subscriptions"},
      {"command":"set_default","description":"Customize default settings"},
      {"command":"import","description":"Import subscriptions from an OPML file"},
      {"command":"export","description":"Export subscriptions to an OPML file"},
      {"command":"activate_subs","description":"Activate subscriptions"},
      {"command":"deactivate_subs","description":"Deactivate subscriptions"},
      {"command":"version","description":"Check the bot version"},
      {"command":"lang","description":"Select a language"},
      {"command":"help","description":"View help"}
    ]
  }'
```

## 验证

```bash
# 检查 D1 表是否创建成功
wrangler d1 execute <数据库名> --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# 检查 webhook 状态
curl "https://api.telegram.org/bot<token>/getWebhookInfo"

# 检查命令是否注册
curl "https://api.telegram.org/bot<token>/getMyCommands"
```
