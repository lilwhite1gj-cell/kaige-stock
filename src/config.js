'use strict';

const fs = require('fs');
const path = require('path');

// 极简 .env 加载器（零依赖）
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
    }
  } catch (e) {
    // 忽略 .env 读取错误
  }
}

loadEnv();

const root = path.join(__dirname, '..');

module.exports = {
  root,
  port: parseInt(process.env.PORT || '3000', 10),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  aiEnabledByDefault: (process.env.AI_ENABLED || 'true') === 'true',
  newsLimit: parseInt(process.env.NEWS_LIMIT || '60', 10),
  refreshHours: parseFloat(process.env.REFRESH_HOURS || '24'),
  dataDir: path.join(root, 'data'),
  publicDir: path.join(root, 'public'),
};
