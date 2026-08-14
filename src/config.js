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
  // 数据源管理：按市场标签筛选/合并，支持重试与策略切换
  dataSources: {
    // 启用的市场标签；空数组 = 启用全部。可选值：'综合' | 'A股' | '港股' | '美股'
    markets: [],
    // 'merge' = 合并所有启用源；'priority' = 仅取第一个成功的源（用于「单源切换」）
    strategy: 'merge',
    // 每个数据源请求失败时的重试次数
    retries: 2,
    // 单次请求超时（毫秒）
    timeoutMs: 15000,
  },
};
