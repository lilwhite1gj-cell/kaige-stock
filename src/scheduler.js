'use strict';

const config = require('./config');
const store = require('./store');
const fetchNews = require('./fetchNews');
const ai = require('./aiAnalysis');

const NEWS_FILE = 'news.json';
const ANALYSIS_FILE = 'analysis.json';
const STATE_FILE = 'state.json';

const state = {
  aiEnabled: config.aiEnabledByDefault,
  lastNewsUpdate: null,
  lastAnalysisUpdate: null,
  lastError: null,
  sources: [],
  isFallback: false,
};

function loadState() {
  const saved = store.readJson(STATE_FILE, null);
  if (saved && typeof saved.aiEnabled === 'boolean') {
    state.aiEnabled = saved.aiEnabled;
  }
}

function persistState() {
  store.writeJson(STATE_FILE, {
    aiEnabled: state.aiEnabled,
    lastNewsUpdate: state.lastNewsUpdate,
    lastAnalysisUpdate: state.lastAnalysisUpdate,
    lastError: state.lastError,
    sources: state.sources,
    isFallback: state.isFallback,
  });
}

async function refreshNews() {
  const result = await fetchNews.fetchAll();
  store.writeJson(NEWS_FILE, {
    items: result.items,
    fetchedAt: result.fetchedAt,
    isFallback: result.isFallback,
    sources: result.sources,
  });
  state.lastNewsUpdate = result.fetchedAt;
  state.sources = result.sources;
  state.isFallback = result.isFallback;
  return result;
}

async function refreshAnalysis() {
  const news = store.readJson(NEWS_FILE, { items: [] });
  if (!state.aiEnabled) {
    store.writeJson(ANALYSIS_FILE, { enabled: false, generatedAt: new Date().toISOString() });
    state.lastAnalysisUpdate = new Date().toISOString();
    return;
  }
  if (!config.deepseek.apiKey) {
    store.writeJson(ANALYSIS_FILE, { enabled: true, noKey: true, generatedAt: new Date().toISOString() });
    state.lastAnalysisUpdate = new Date().toISOString();
    return;
  }
  const r = await ai.generateAnalysis(news.items || []);
  if (r.ok) {
    store.writeJson(ANALYSIS_FILE, Object.assign({ enabled: true }, r.data, { generatedAt: r.generatedAt }));
  } else {
    store.writeJson(ANALYSIS_FILE, { enabled: true, error: r.reason, detail: r.detail, generatedAt: new Date().toISOString() });
  }
  state.lastAnalysisUpdate = new Date().toISOString();
}

async function refreshAll() {
  try {
    await refreshNews();
    await refreshAnalysis();
    state.lastError = null;
  } catch (e) {
    state.lastError = String(e && e.message ? e.message : e);
  } finally {
    persistState();
  }
}

function getNews() {
  return store.readJson(NEWS_FILE, { items: [], fetchedAt: null, isFallback: false, sources: [] });
}

function getAnalysis() {
  return store.readJson(ANALYSIS_FILE, { enabled: false });
}

function getConfig() {
  return {
    aiEnabled: state.aiEnabled,
    hasKey: !!config.deepseek.apiKey,
    lastNewsUpdate: state.lastNewsUpdate,
    lastAnalysisUpdate: state.lastAnalysisUpdate,
    sources: state.sources,
    isFallback: state.isFallback,
    model: config.deepseek.model,
  };
}

function setAiEnabled(val) {
  state.aiEnabled = !!val;
  persistState();
  // 异步刷新分析，不阻塞接口返回
  refreshAnalysis().then(persistState).catch(() => {});
}

function init() {
  loadState();
  // 启动时立即刷新一次
  refreshAll().then(persistState).catch(() => {});

  // 定时检查：达到刷新间隔则自动更新（默认每24小时）
  const intervalMs = Math.max(1, config.refreshHours) * 3600 * 1000;
  setInterval(() => {
    const last = state.lastNewsUpdate ? new Date(state.lastNewsUpdate).getTime() : 0;
    if (Date.now() - last >= intervalMs) {
      refreshAll().then(persistState).catch(() => {});
    }
  }, 60 * 60 * 1000); // 每小时检查一次
}

module.exports = {
  init,
  getNews,
  getAnalysis,
  getConfig,
  setAiEnabled,
  refreshAll,
};
