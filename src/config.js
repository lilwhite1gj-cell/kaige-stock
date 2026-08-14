// 配置（零依赖，纯读取环境变量；不引入 fs，确保 Cloudflare Worker 构建干净）
export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  aiEnabledByDefault: (process.env.AI_ENABLED || 'true') === 'true',
  newsLimit: parseInt(process.env.NEWS_LIMIT || '60', 10),
  refreshHours: parseFloat(process.env.REFRESH_HOURS || '24'),
  // 实时行情（行情面信号源）
  quotes: {
    // 服务端行情缓存 TTL（毫秒）：前端每 30s 轮询，命中缓存则不重复打上游
    cacheMs: parseInt(process.env.QUOTE_CACHE_MS || '30000', 10),
    // 单源请求超时（毫秒）
    timeoutMs: parseInt(process.env.QUOTE_TIMEOUT_MS || '9000', 10),
    // 失败重试次数
    retries: parseInt(process.env.QUOTE_RETRIES || '1', 10),
    // 自选股兜底池（新闻无明确标的时用作融合标的；secid 为东方财富代码）
    watchlist: [
      { secid: '1.600519', name: '贵州茅台' },
      { secid: '0.300750', name: '宁德时代' },
      { secid: '0.002594', name: '比亚迪' },
      { secid: '1.601318', name: '中国平安' },
      { secid: '1.600036', name: '招商银行' },
      { secid: '0.300059', name: '东方财富' },
      { secid: '1.600030', name: '中信证券' },
      { secid: '0.000725', name: '京东方A' },
    ],
  },
  // 综合推荐（新闻×行情融合）
  recommendations: {
    // 融合标的上限（自选兜底 + 新闻衍生，去重后截断）
    maxCandidates: parseInt(process.env.RECO_MAX || '10', 10),
    // 融合结果缓存 TTL（毫秒）：AI 判断不需每次轮询刷新，价格由 /api/quotes 实时叠加
    cacheMs: parseInt(process.env.RECO_CACHE_MS || '900000', 10),
  },
  // 数据源管理：按市场标签筛选/合并，支持重试与策略切换
  dataSources: {
    // 启用的市场标签；空数组 = 启用全部。可选值：'综合' | 'A股' | '港股' | '美股'
    markets: [],
    // 'merge' = 合并所有启用源；'priority' = 仅取第一个成功的源（用于「单源切换」）
    strategy: 'merge',
    // 每个数据源请求失败时的重试次数（海外节点被墙源快速失败更友好，默认 1）
    retries: parseInt(process.env.DS_RETRIES || '1', 10),
    // 单次请求超时（毫秒），默认 10s
    timeoutMs: parseInt(process.env.DS_TIMEOUT_MS || '10000', 10),
  },
};
