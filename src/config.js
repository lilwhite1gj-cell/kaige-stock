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
};
