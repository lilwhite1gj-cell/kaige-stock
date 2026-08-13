// 文件存储实现（本地 Node 运行用）。仅本地入口 server.js / snapshot.js 引用，
// Cloudflare Worker 不会加载本文件，因此可安全 import node:fs。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

export const fileStore = {
  async readJson(name, fallback) {
    try {
      const p = path.join(dataDir, name);
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      // 损坏的文件，返回兜底值
    }
    return fallback;
  },
  async writeJson(name, data) {
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, name), JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      // 写入失败（如只读目录）静默忽略
    }
  },
};
