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
  // ETF 板块推荐池（聚焦两类市场：国内板块 + 纳斯达克相关）
  // secid 为东方财富代码；sector 为板块分类（前端据此分组）
  etf: {
    // 国内板块 ETF：宽基核心 + 行业 + 策略
    domestic: [
      { secid: '1.510300', name: '沪深300ETF', code: '510300', sector: '宽基·核心' },
      { secid: '1.510500', name: '中证500ETF', code: '510500', sector: '宽基·中盘' },
      { secid: '0.159915', name: '创业板ETF', code: '159915', sector: '宽基·成长' },
      { secid: '1.588000', name: '科创50ETF', code: '588000', sector: '宽基·科技' },
      { secid: '1.512480', name: '半导体ETF', code: '512480', sector: '行业·半导体' },
      { secid: '1.515030', name: '新能源车ETF', code: '515030', sector: '行业·新能源' },
      { secid: '1.512010', name: '医药ETF', code: '512010', sector: '行业·医药' },
      { secid: '0.159928', name: '消费ETF', code: '159928', sector: '行业·消费' },
      { secid: '1.512000', name: '券商ETF', code: '512000', sector: '行业·金融' },
      { secid: '1.512800', name: '银行ETF', code: '512800', sector: '行业·金融' },
      { secid: '1.512660', name: '军工ETF', code: '512660', sector: '行业·军工' },
      { secid: '1.510880', name: '红利ETF', code: '510880', sector: '策略·红利' },
    ],
    // 纳斯达克相关 ETF：纳指100 跟踪 + 美股大盘对比
    nasdaq: [
      { secid: '1.513100', name: '纳指ETF', code: '513100', sector: '纳斯达克100' },
      { secid: '1.513300', name: '纳斯达克ETF', code: '513300', sector: '纳斯达克100' },
      { secid: '1.513500', name: '标普500ETF', code: '513500', sector: '美股大盘·标普500' },
      { secid: '1.513400', name: '道琼斯ETF', code: '513400', sector: '美股大盘·道琼斯' },
    ],
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
