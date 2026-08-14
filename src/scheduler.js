import { config } from './config.js';
import * as fetchNews from './fetchNews.js';
import * as ai from './aiAnalysis.js';
import * as quotes from './fetchQuotes.js';
import * as fusion from './fusion.js';

const NEWS_FILE = 'news.json';
const ANALYSIS_FILE = 'analysis.json';
const QUOTES_FILE = 'quotes.json';
const RECO_FILE = 'recommendations.json';
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
    lastQuotesUpdate: null,
    lastRecoUpdate: null,
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
    diagnostics: result.diagnostics || [],
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
  // 抓取精选 ETF 池实时行情，作为 ETF 推荐的行情面依据（失败不阻断分析）
  let etfQuotes = null;
  try {
    etfQuotes = await quotes.fetchEtfs();
  } catch (e) {
    etfQuotes = null;
  }
  const r = await ai.generateAnalysis(news.items || [], apiKey, etfQuotes);
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

// 收集融合候选的 secid：新闻衍生(analysis.stocks 名称解析) ∪ 自选兜底
async function collectCandidateSecids() {
  const analysis = await requireStore().readJson(ANALYSIS_FILE, { stocks: [] });
  const secids = [];
  const push = (s) => s && secids.push(s);
  for (const w of config.quotes.watchlist) push(w.secid);
  for (const s of analysis.stocks || []) {
    if (s && s.name) {
      const secid = await quotes.resolveCode(s.name).catch(() => null);
      push(secid);
    }
  }
  return [...new Set(secids.filter(Boolean))];
}

// 刷新行情：大盘指数 + 候选标的实时价/资金流，落库 quotes.json
export async function refreshQuotes() {
  const secids = await collectCandidateSecids();
  const [indices, stocks] = await Promise.all([quotes.fetchIndices(), quotes.fetchQuotes(secids)]);
  const payload = {
    indices: indices.map((i) => ({
      name: i.name,
      secid: i.secid,
      code: i.code,
      price: i.price,
      changePct: i.changePct,
    })),
    stocks: stocks.map((q) => ({
      secid: q.secid,
      code: q.code,
      name: q.name,
      market: q.market,
      price: q.price,
      changePct: q.changePct,
      change: q.change,
      turnover: q.turnover,
      pe: q.pe,
      pb: q.pb,
      marketCap: q.marketCap,
      amount: q.amount,
      mainNetInflow: q.mainNetInflow,
      retailNetInflow: q.retailNetInflow,
      middleNetInflow: q.middleNetInflow,
      bigNetInflow: q.bigNetInflow,
      hugeNetInflow: q.hugeNetInflow,
      fallback: !!q.fallback,
    })),
    fetchedAt: new Date().toISOString(),
    sources: ['eastmoney', 'tencent-fallback'],
  };
  await requireStore().writeJson(QUOTES_FILE, payload);
  return payload;
}

// 实时行情（前端轮询用）：重新抓取（受 fetchQuotes 内部 30s 缓存保护），不落库以避免频繁写 KV
export async function getLiveQuotes() {
  const secids = await collectCandidateSecids();
  const [indices, stocks] = await Promise.all([quotes.fetchIndices(), quotes.fetchQuotes(secids)]);
  return {
    indices: indices.map((i) => ({ name: i.name, secid: i.secid, code: i.code, price: i.price, changePct: i.changePct })),
    stocks: stocks.map((q) => ({
      secid: q.secid, code: q.code, name: q.name, market: q.market,
      price: q.price, changePct: q.changePct, change: q.change, turnover: q.turnover,
      pe: q.pe, pb: q.pb, marketCap: q.marketCap, amount: q.amount,
      mainNetInflow: q.mainNetInflow, fallback: !!q.fallback,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

// 刷新综合推荐（新闻×行情融合）
export async function refreshRecommendations(apiKey) {
  const state = await loadState();
  const news = await requireStore().readJson(NEWS_FILE, { items: [] });
  const analysis = await requireStore().readJson(ANALYSIS_FILE, { stocks: [], etfs: [] });
  const quotesData = await requireStore().readJson(QUOTES_FILE, { indices: [], stocks: [] });
  const key = apiKey || config.deepseek.apiKey;
  if (!key) {
    await requireStore().writeJson(RECO_FILE, { enabled: true, noKey: true, generatedAt: new Date().toISOString() });
    return;
  }
  const r = await fusion.generateRecommendations(
    { news: news.items || [], analysis, quotes: quotesData },
    key,
  );
  if (r.ok) {
    await requireStore().writeJson(RECO_FILE, Object.assign({ enabled: true }, r.data, { generatedAt: r.generatedAt }));
  } else {
    await requireStore().writeJson(RECO_FILE, {
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
    state.sourceDiagnostics = r.diagnostics || [];
    state.isFallback = r.isFallback;
    await refreshAnalysis(apiKey);
    state.lastAnalysisUpdate = new Date().toISOString();
    const q = await refreshQuotes();
    state.lastQuotesUpdate = q.fetchedAt;
    await refreshRecommendations(apiKey);
    state.lastRecoUpdate = new Date().toISOString();
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

export async function getQuotes() {
  return requireStore().readJson(QUOTES_FILE, { indices: [], stocks: [], fetchedAt: null });
}

export async function getRecommendations() {
  return requireStore().readJson(RECO_FILE, { enabled: false });
}

// 实时 ETF 行情（前端轮询用）：重新抓取（受 fetchQuotes 内部 30s 缓存保护），不落库
export async function getEtfQuotes() {
  return quotes.fetchEtfs();
}

export async function getConfig(apiKey) {
  const state = await loadState();
  return {
    aiEnabled: state.aiEnabled,
    hasKey: !!apiKey,
    lastNewsUpdate: state.lastNewsUpdate,
    lastAnalysisUpdate: state.lastAnalysisUpdate,
    lastQuotesUpdate: state.lastQuotesUpdate,
    lastRecoUpdate: state.lastRecoUpdate,
    sources: state.sources,
    sourceDiagnostics: state.sourceDiagnostics || [],
    isFallback: state.isFallback,
    lastError: state.lastError,
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
