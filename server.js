// 本地运行入口：零依赖 Node.js HTTP 服务（与 Cloudflare Worker 共用 src 模块）
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import * as scheduler from './src/scheduler.js';
import { fileStore } from './src/fileStore.js';
import { allSectors } from './src/categorize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

scheduler.setStore(fileStore);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(publicDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  import('node:fs').then((fs) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

async function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, await scheduler.getConfig(config.deepseek.apiKey));
    }

    if (pathname === '/api/config' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.aiEnabled === 'boolean') await scheduler.setAiEnabled(body.aiEnabled, config.deepseek.apiKey);
      return sendJson(res, 200, await scheduler.getConfig(config.deepseek.apiKey));
    }

    if (pathname === '/api/news' && req.method === 'GET') {
      const news = await scheduler.getNews();
      return sendJson(res, 200, Object.assign({ sectors: allSectors() }, news));
    }

    if (pathname === '/api/analysis' && req.method === 'GET') {
      return sendJson(res, 200, await scheduler.getAnalysis());
    }

    if (pathname === '/api/quotes' && req.method === 'GET') {
      try {
        return sendJson(res, 200, await scheduler.getLiveQuotes());
      } catch (e) {
        return sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
      }
    }

    if (pathname === '/api/recommendations' && req.method === 'GET') {
      return sendJson(res, 200, await scheduler.getRecommendations());
    }

    if (pathname === '/api/refresh' && req.method === 'POST') {
      scheduler.refreshAll(config.deepseek.apiKey).catch(() => {});
      return sendJson(res, 200, { ok: true, message: '已触发刷新' });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'not found' });
    }

    return serveStatic(req, res, pathname);
  } catch (e) {
    return sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
  }
});

// 启动即刷新一次
scheduler.refreshAll(config.deepseek.apiKey).then(() => {}).catch(() => {});

// 定时检查：达到刷新间隔则自动更新（默认每 24 小时）
const intervalMs = Math.max(1, config.refreshHours) * 3600 * 1000;
setInterval(async () => {
  const cfg = await scheduler.getConfig(config.deepseek.apiKey).catch(() => null);
  const last = cfg && cfg.lastNewsUpdate ? new Date(cfg.lastNewsUpdate).getTime() : 0;
  if (Date.now() - last >= intervalMs) {
    scheduler.refreshAll(config.deepseek.apiKey).catch(() => {});
  }
}, 60 * 60 * 1000);

server.listen(config.port, () => {
  console.log(`恺哥荐股 已启动: http://localhost:${config.port}`);
  if (!config.deepseek.apiKey) {
    console.log('提示: 未配置 DEEPSEEK_API_KEY，AI 分析将不可用（页面开启开关后需配置 Key）。');
  }
});
