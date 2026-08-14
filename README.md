# 恺哥荐股（kaige-stock）

一个联网运行的财经资讯 + AI 荐股分析网站。自动抓取每日财经新闻并按板块分类展示，并集成 DeepSeek AI 生成个股投资分级与 ETF 板块建议；升级版新增**综合荐股引擎**：将新闻基本面信号与实时行情量价/资金信号交叉验证、加权融合，输出买入/持有/卖出操作建议。

> ⚠️ 免责声明：本站所有内容均基于公开资讯与 AI 模型生成，**仅供参考，不构成任何投资建议**。投资有风险，决策需谨慎，请自行判断并承担相应责任。

## 功能特性

- **每日财经新闻**：联网自动抓取（新浪财经、东方财富快讯、财联社电报、巨潮资讯等多源容错），按 科技 / 金融 / 消费 / 医药 / 新能源 / 地产 / 军工 等板块分类，前端支持按板块筛选浏览。
- **AI 智能分析（可选开关）**：
  - 个股投资分级：推荐投资个股 / 少量持有个股 / 高风险个股。
  - 每日 ETF 板块建议：分析当前热门板块与相关 ETF，给出 买入 / 持有 / 回避 建议。
  - 用户可在页面右上角自由开启/关闭 AI 功能。
- **🎯 综合荐股（新闻 × 行情，核心升级）**：
  - **行情面信号**：实时获取个股最新价、涨跌幅、换手率、市盈率/市净率、成交额，以及**主力资金流向（净流入/流出）**；大盘指数（上证/深证/创业板/恒生/纳斯达克/标普）。
  - **新闻面信号**：从财经新闻中提取个股相关舆情、政策与事件影响。
  - **交叉验证与加权融合**：DeepSeek 将两面信号融合，输出每只标的的 **操作建议（买入 / 持有 / 卖出）**、综合评分、信心度、新闻面/行情面信号强弱，并标注**基本面与量价是否背离**。
  - **实时更新**：前端每 30 秒轮询行情接口（服务端 30 秒缓存，不打爆上游），价格/涨跌/资金流实时刷新；AI 研判在刷新/定时任务时更新。
- **每日自动更新**：Cloudflare 上由 Cron Trigger 每日定时抓取；本地/Node 主机由定时巡检 + 满 24h 自动刷新；前端定时轮询保持同步。
- **响应式界面**：移动端自适应，新闻区 / AI 区 / 综合荐股区清晰分区。
- **安全**：外部新闻标题全部 HTML 转义防 XSS；行情与 AI 调用均在后端完成，API Key 不暴露给前端。

### 实时行情数据源说明
- **个股行情**：东方财富 push2 实时行情接口（CDN 全球可达，含价格/涨跌幅/换手率/市盈率/市净率/成交额 + 主力资金流向）；东方财富不可达时自动回退腾讯行情。
- **大盘指数**：腾讯行情 `qt.gtimg.cn`（GBK，Node 22 / Render 完整支持；Cloudflare Workers 若运行环境不支持 GBK 解码则大盘指数可能为空，个股行情与融合推荐不受影响）。
- **自选股兜底池**：`src/config.js` 的 `quotes.watchlist` 可配置；当当日新闻无明确提及标的时，用作融合标的，保证页面始终有数据。

## 本地运行

零运行时依赖，仅需 Node.js（>=18）。

```bash
cd kaige-stock
cp .env.example .env        # 可选：填入 DEEPSEEK_API_KEY 以启用 AI 分析
node server.js              # 默认监听 http://localhost:3000
```

- 不配置 Key 时，新闻与界面照常运行，仅 AI 区提示需配置 Key。
- 配置 Key 后，页面右上角开启「AI 分析」即可看到分级与 ETF 建议。

### 环境变量（.env）

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥，启用 AI 分析需要 | 空 |
| `PORT` | 服务端口 | `3000` |
| `DEEPSEEK_BASE_URL` | DeepSeek 兼容接口地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名 | `deepseek-chat` |
| `QUOTE_CACHE_MS` | 服务端行情缓存 TTL（毫秒） | `30000` |
| `QUOTE_TIMEOUT_MS` | 单个行情请求超时（毫秒） | `9000` |
| `RECO_CACHE_MS` | 综合推荐结果缓存 TTL（毫秒） | `900000` |

## 部署到 Cloudflare（全栈，推荐上云）

本项目已适配 **Cloudflare Workers + KV + Cron Triggers**，可把「每日自动抓取 + AI 分析」完整上云自动运行（不再只是静态快照）。

### 前置
- 一个 Cloudflare 账号（免费额度即可：Workers 10 万请求/天、KV/Cron 免费）
- 本地安装 Node.js >=18 与 Wrangler：`npm i -g wrangler`（或每次用 `npx wrangler`）

### 步骤
1. 登录并创建 KV 命名空间：
   ```bash
   wrangler login
   wrangler kv namespace create NEWS_KV
   ```
   复制输出的 `id`，填入 `wrangler.toml` 的 `kv_namespaces[].id`（替换 `REPLACE_WITH_YOUR_KV_ID`）。
2. （可选）设置 DeepSeek API Key 为 Secret（启用 AI 分析需要）：
   ```bash
   wrangler secret put DEEPSEEK_API_KEY
   ```
   按提示粘贴密钥。也可在 Cloudflare 控制台 → Workers → kaige-stock → Settings → Variables 中添加 `DEEPSEEK_API_KEY`（类型选 Secret）。
3. 部署：
   ```bash
   wrangler deploy
   ```
   完成后返回 `*.workers.dev` 地址，打开即可访问。
4. 定时任务：Cron（`0 1 * * *`，即北京时间 09:00）已在 `wrangler.toml` 注册，也可在控制台 → Triggers 查看/修改。首次建议手动触发一次刷新：
   ```bash
   curl -X POST https://<你的域名>/api/refresh
   ```

### 本地用 Wrangler 调试
```bash
wrangler dev        # 本地启动 Worker + 静态资源，默认 http://localhost:8787
```
本地的 KV / Secret 可通过项目根目录 `.dev.vars` 提供（已 gitignore，切勿提交）：
```
DEEPSEEK_API_KEY=你的密钥
```

### 架构说明
- 前端静态资源由 `wrangler.toml` 的 `[assets]` 托管，API 由 Worker 处理，同源无需跨域。
- 新闻与分析存于 KV（`NEWS_KV`），每日 Cron 自动刷新；用户在前端开启「AI 分析」开关会即时触发分析并写入 KV。
- Cloudflare 边缘节点位于海外，抓取新浪 / 东财 / 财联社 / 巨潮通常比本地沙箱更通畅。

## 其它部署形态

1. **Node 云主机（完整实时版）**：在任意支持 Node.js 的云主机 / PaaS（Render、Railway、Fly.io、VPS 等）运行 `node server.js`，即具备每日自动抓取、AI 分析与自动更新。注意监听 `process.env.PORT` 并绑定 `0.0.0.0`。
2. **静态快照版**：CloudStudio 等纯静态托管只提供文件服务，无法运行后端。先执行 `npm run snapshot` 生成 `public/data-snapshot.json`（最近一次抓取的真实新闻），前端在检测不到后端时会自动加载该快照展示，并标注为「静态快照模式」。
   ```bash
   npm run snapshot       # 生成 public/data-snapshot.json
   ```

## 项目结构

```
server.js              本地运行入口（Node HTTP 服务 + API 路由）
src/
  worker.js            Cloudflare Worker 入口（API 路由 + Cron 定时抓取）
  config.js            配置（读取环境变量）
  kvStore.js           Cloudflare KV 存储实现（Worker 用）
  fileStore.js         本地文件存储实现（Node 用）
  categorize.js        新闻板块关键词分类
  fetchNews.js         多数据源抓取（容错 + 兜底）
  fetchQuotes.js       实时行情抓取（东方财富 + 腾讯兜底 + 大盘指数）
  aiAnalysis.js        DeepSeek 调用（OpenAI 兼容，JSON 输出）
  fusion.js            综合荐股融合引擎（新闻 × 行情）
  scheduler.js         状态管理与刷新（store 由入口注入）
  snapshot.js          生成静态快照（npm run snapshot）
wrangler.toml          Cloudflare 部署配置（KV + Cron + 静态资源）
public/
  index.html           前端页面
  styles.css           样式（含响应式与快照横幅）
  app.js               前端逻辑（含静态快照模式）
  data-snapshot.json   静态快照数据（gitignore）
.env.example           环境变量示例
```

## API 概览

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/config` | GET / POST | 读取 / 更新配置（如 `aiEnabled`） |
| `/api/news` | GET | 获取已抓取并分类的新闻 |
| `/api/analysis` | GET | 获取 AI 分析结果（需配置 Key 且开启） |
| `/api/quotes` | GET | 获取实时行情（大盘指数 + 自选/候选标的量价与资金流），前端 30s 轮询 |
| `/api/recommendations` | GET | 获取综合荐股结果（新闻 × 行情融合，需配置 Key） |
| `/api/refresh` | POST | 手动触发重新抓取 + 分析 + 行情 + 融合 |
