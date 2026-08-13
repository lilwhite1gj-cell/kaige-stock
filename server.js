'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const scheduler = require('./src/scheduler');
const { allSectors } = require('./src/categorize');

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
  const filePath = path.join(config.publicDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(config.publicDir)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
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
      return sendJson(res, 200, scheduler.getConfig());
    }

    if (pathname === '/api/config' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.aiEnabled === 'boolean') scheduler.setAiEnabled(body.aiEnabled);
      return sendJson(res, 200, scheduler.getConfig());
    }

    if (pathname === '/api/news' && req.method === 'GET') {
      const news = scheduler.getNews();
      return sendJson(res, 200, Object.assign({ sectors: allSectors() }, news));
    }

    if (pathname === '/api/analysis' && req.method === 'GET') {
      return sendJson(res, 200, scheduler.getAnalysis());
    }

    if (pathname === '/api/refresh' && req.method === 'POST') {
      scheduler.refreshAll().catch(() => {});
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

scheduler.init();

server.listen(config.port, () => {
  console.log(`恺哥荐股 已启动: http://localhost:${config.port}`);
  if (!config.deepseek.apiKey) {
    console.log('提示: 未配置 DEEPSEEK_API_KEY，AI 分析将不可用（仍可在页面开启开关，但需配置 Key）。');
  }
});

module.exports = server;
