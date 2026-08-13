// Cloudflare Worker 入口：处理 API 请求 + 定时抓取（Cron Trigger）
// 静态资源由 wrangler.toml 的 [assets] 提供（env.ASSETS）
import { config } from './config.js';
import * as scheduler from './scheduler.js';
import { allSectors } from './categorize.js';
import { createKvStore } from './kvStore.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// DeepSeek Key 优先取 Worker 绑定（secret），回退本地 .env（仅本地 wrangler dev）
function getKey(env) {
  return (env && env.DEEPSEEK_API_KEY) || config.deepseek.apiKey || '';
}

async function handleApi(request, env, ctx) {
  // 每次请求注入 KV 存储（无状态 Worker 安全做法）
  scheduler.setStore(createKvStore(env.NEWS_KV));
  const url = new URL(request.url);
  const p = url.pathname;
  const key = getKey(env);

  if (p === '/api/config' && request.method === 'GET') {
    return json(await scheduler.getConfig(key));
  }

  if (p === '/api/config' && request.method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      // ignore
    }
    if (typeof body.aiEnabled === 'boolean') {
      await scheduler.setAiEnabled(body.aiEnabled, key);
    }
    return json(await scheduler.getConfig(key));
  }

  if (p === '/api/news' && request.method === 'GET') {
    const news = await scheduler.getNews();
    return json(Object.assign({ sectors: allSectors() }, news));
  }

  if (p === '/api/analysis' && request.method === 'GET') {
    return json(await scheduler.getAnalysis());
  }

  if (p === '/api/refresh' && request.method === 'POST') {
    // 用 ctx.waitUntil 保活，确保刷新任务完整跑完（含抓取+AI）再结束 Worker
    ctx.waitUntil(
      scheduler
        .refreshAll(key)
        .then(() => console.log('refresh done'))
        .catch((e) => console.error('refresh error', e && e.stack ? e.stack : e))
    );
    return json({ ok: true, message: '已触发刷新，约 20 秒后刷新页面查看' });
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx);
      } catch (e) {
        return json({ error: String(e && e.message ? e.message : e) }, 500);
      }
    }
    // 非 API 请求 -> 返回静态资源（public/）
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger：每日定时抓取新闻 + 生成 AI 分析（存 KV）
  async scheduled(event, env, ctx) {
    scheduler.setStore(createKvStore(env.NEWS_KV));
    ctx.waitUntil(scheduler.refreshAll(getKey(env)));
  },
};
