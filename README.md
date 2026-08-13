# 恺哥荐股（kaige-stock）

一个联网运行的财经资讯 + AI 荐股分析网站。自动抓取每日财经新闻并按板块分类展示，并可选集成 DeepSeek AI 生成个股投资分级与 ETF 板块建议。

> ⚠️ 免责声明：本站所有内容均基于公开资讯与 AI 模型生成，**仅供参考，不构成任何投资建议**。投资有风险，决策需谨慎，请自行判断并承担相应责任。

## 功能特性

- **每日财经新闻**：联网自动抓取（新浪财经、东方财富快讯、财联社电报、巨潮资讯等多源容错），按 科技 / 金融 / 消费 / 医药 / 新能源 / 地产 / 军工 等板块分类，前端支持按板块筛选浏览。
- **AI 智能分析（可选开关）**：
  - 个股投资分级：推荐投资个股 / 少量持有个股 / 高风险个股。
  - 每日 ETF 板块建议：分析当前热门板块与相关 ETF，给出 买入 / 持有 / 回避 建议。
  - 用户可在页面右上角自由开启/关闭 AI 功能。
- **每日自动更新**：启动即抓取，定时巡检 + 满 24h 自动刷新；前端定时轮询保持同步。
- **响应式界面**：移动端自适应，新闻区与 AI 区清晰分区。
- **安全**：外部新闻标题全部 HTML 转义防 XSS；AI 调用在后端完成，API Key 不暴露给前端。

## 本地运行

零依赖，仅需 Node.js（>=18）。

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
| `DEEPSEEK_BASE_URL` | DeepSeek 兼容接口地址 | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 模型名 | `deepseek-chat` |

## 部署

项目分两种运行形态：

1. **完整实时版（推荐）**：在任意支持 Node.js 的云主机 / PaaS（Render、Railway、Fly.io、VPS 等）运行 `node server.js`，即具备每日自动抓取、AI 分析与自动更新。注意监听 `process.env.PORT` 并绑定 `0.0.0.0`。
2. **静态快照版**：CloudStudio 等纯静态托管只提供文件服务，无法运行后端。可先执行 `npm run snapshot` 生成 `public/data-snapshot.json`（最近一次抓取的真实新闻），前端在检测不到后端时会自动加载该快照展示，并标注为「静态快照模式」。

```bash
npm install            # 仅用于读取 scripts（项目本身零运行时依赖）
npm run snapshot       # 生成 public/data-snapshot.json
```

## 项目结构

```
server.js               HTTP 服务与 API 路由
src/
  config.js             配置（端口、环境变量、目录）
  store.js              数据读写与落盘
  categorize.js         新闻板块关键词分类
  fetchNews.js          多数据源抓取（容错 + 兜底）
  aiAnalysis.js         DeepSeek 调用（OpenAI 兼容，JSON 输出）
  scheduler.js          状态管理与定时刷新
  snapshot.js           生成静态快照（npm run snapshot）
public/
  index.html            前端页面
  styles.css            样式（含响应式与快照横幅）
  app.js                前端逻辑（含静态快照模式）
  data-snapshot.json    静态快照数据
.env.example            环境变量示例
```

## API 概览

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/config` | GET / POST | 读取 / 更新配置（如 `aiEnabled`） |
| `/api/news` | GET | 获取已抓取并分类的新闻 |
| `/api/analysis` | GET | 获取 AI 分析结果（需配置 Key 且开启） |
| `/api/refresh` | POST | 手动触发重新抓取与分析 |
