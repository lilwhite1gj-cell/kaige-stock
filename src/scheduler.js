import { config } from './config.js';
import * as fetchNews from './fetchNews.js';
import * as ai from './aiAnalysis.js';

const NEWS_FILE = 'news.json';
const ANALYSIS_FILE = 'analysis.json';
const STATE_FILE = 'state.json';

// 存储实现由入口注入（本地 fileStore / Cloudflare kvStore），避免 Worker 构建引入 fs
let store = null;
export function setStore(s) {
  store = s;
}
function requireStore() {
  if (!store) throw new Error('store not initialized');
  return store;
}

function defaultState() {
  return {
    aiEnabled: config.aiEnabledByDefault,
    lastNewsUpdate: null,
    lastAnalysisUpdate: null,
    lastError: null,
    sources: [],
    isFallback: false,
  };
}

export async function loadState() {
  const saved = await requireStore().readJson(STATE_FILE, null);
  if (saved && typeof saved.aiEnabled === 'boolean') return saved;
  return defaultState();
}

export async function saveState(state) {
  await requireStore().writeJson(STATE_FILE, state);
}

export async function refreshNews() {
  const result = await fetchNews.fetchAll();
  await requireStore().writeJson(NEWS_FILE, {
    items: result.items,
    fetchedAt: result.fetchedAt,
    isFallback: result.isFallback,
    sources: result.sources,
  });
  return result;
}

export async function refreshAnalysis(apiKey) {
  const news = await requireStore().readJson(NEWS_FILE, { items: [] });
  const state = await loadState();
  if (!state.aiEnabled) {
    await requireStore().writeJson(ANALYSIS_FILE, { enabled: false, generatedAt: new Date().toISOString() });
    return;
  }
  if (!apiKey) {
    await requireStore().writeJson(ANALYSIS_FILE, { enabled: true, noKey: true, generatedAt: new Date().toISOString() });
    return;
  }
  const r = await ai.generateAnalysis(news.items || [], apiKey);
  if (r.ok) {
    await requireStore().writeJson(ANALYSIS_FILE, Object.assign({ enabled: true }, r.data, { generatedAt: r.generatedAt }));
  } else {
    await requireStore().writeJson(ANALYSIS_FILE, {
      enabled: true,
      error: r.reason,
      detail: r.detail,
      generatedAt: new Date().toISOString(),
    });
  }
}

export async function refreshAll(apiKey) {
  const state = await loadState();
  try {
    const r = await refreshNews();
    state.lastNewsUpdate = r.fetchedAt;
    state.sources = r.sources;
    state.isFallback = r.isFallback;
    await refreshAnalysis(apiKey);
    state.lastAnalysisUpdate = new Date().toISOString();
    state.lastError = null;
  } catch (e) {
    state.lastError = String(e && e.message ? e.message : e);
  } finally {
    await saveState(state);
  }
}

export async function getNews() {
  return requireStore().readJson(NEWS_FILE, { items: [], fetchedAt: null, isFallback: false, sources: [] });
}

export async function getAnalysis() {
  return requireStore().readJson(ANALYSIS_FILE, { enabled: false });
}

export async function getConfig(apiKey) {
  const state = await loadState();
  return {
    aiEnabled: state.aiEnabled,
    hasKey: !!apiKey,
    lastNewsUpdate: state.lastNewsUpdate,
    lastAnalysisUpdate: state.lastAnalysisUpdate,
    sources: state.sources,
    isFallback: state.isFallback,
    model: config.deepseek.model,
  };
}

export async function setAiEnabled(val, apiKey) {
  const state = await loadState();
  state.aiEnabled = !!val;
  await saveState(state);
  // 异步刷新分析，不阻塞接口返回
  await refreshAnalysis(apiKey);
  await saveState(state);
}
