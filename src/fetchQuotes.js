// 实时行情抓取模块（行情面信号源）
// 主源：东方财富 push2（CDN 全球可达，UTF-8，含实时价/涨跌幅/换手率/市盈率/市净率/市值/成交额 + 主力资金流向）
// 兜底：腾讯行情 qt.gtimg.cn（仅在东方财富单只失败时启用，GBK 需解码）
// 名称->代码：东方财富 suggest 接口（直接返回 QuoteID = secid）
import { config } from './config.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 东方财富 stock/get 字段：最新价/代码/名称/市盈率TTM/市净率/总市值/流通市值/换手率/涨跌幅/涨跌额/成交额(元)
const QUOTE_FIELDS = 'f43,f57,f58,f55,f167,f116,f117,f168,f170,f169,f86';

// 服务端行情缓存（TTL 由 config.quotes.cacheMs 控制，满足「实时但不打爆上游」）
const quoteCache = new Map(); // key: secid -> { ts, quote }
const codeCache = new Map(); // key: name -> secid

function cacheGet(secid) {
  const c = quoteCache.get(secid);
  if (!c) return null;
  if (Date.now() - c.ts > config.quotes.cacheMs) {
    quoteCache.delete(secid);
    return null;
  }
  return c.quote;
}
function cacheSet(secid, quote) {
  quoteCache.set(secid, { ts: Date.now(), quote });
}

async function getJson(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' },
    signal: AbortSignal.timeout(timeoutMs || config.quotes.timeoutMs),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// 把东方财富 secid 前缀映射为市场
export function marketOf(secid) {
  if (!secid) return '其他';
  if (secid.startsWith('1.')) return 'A股';
  if (secid.startsWith('0.')) return 'A股';
  if (secid.startsWith('116.')) return '港股';
  if (secid.startsWith('105.')) return '美股';
  if (secid.startsWith('100.')) return '指数';
  return '其他';
}

// 名称 -> secid（东方财富 suggest）
export async function resolveCode(name) {
  if (!name) return null;
  const cached = codeCache.get(name);
  if (cached !== undefined) return cached || null;
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(
      name,
    )}&type=14&token=D43BF722C8E33BDC906FB770E890478C&field=name`;
    const j = await getJson(url);
    const arr = (j && j.QuotationCodeTable && j.QuotationCodeTable.Data) || [];
    if (arr.length) {
      const secid = arr[0].QuoteID || `${arr[0].MktNum}.${arr[0].Code}`;
      codeCache.set(name, secid);
      return secid;
    }
  } catch (e) {
    // ignore，标记为空避免重复请求
  }
  codeCache.set(name, '');
  return null;
}

// 单只实时行情（东方财富 stock/get）
async function fetchQuoteOne(secid) {
  const cached = cacheGet(secid);
  if (cached) return cached;
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fltt=2&fields=${QUOTE_FIELDS}`;
  const j = await getJson(url);
  const d = j && j.data;
  if (!d || d.f43 == null) throw new Error('empty quote for ' + secid);
  const quote = {
    secid,
    code: d.f57,
    name: d.f58,
    market: marketOf(secid),
    price: num(d.f43),
    changePct: num(d.f170),
    change: num(d.f169),
    turnover: num(d.f168), // 换手率 %
    pe: num(d.f55),
    pb: num(d.f167),
    marketCap: num(d.f116), // 元
    floatCap: num(d.f117), // 元
    amount: num(d.f86), // 成交额 元
  };
  cacheSet(secid, quote);
  return quote;
}

// 单只主力资金流向（东方财富 fflow）
async function fetchFlowOne(secid) {
  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=1&klt=1&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`;
    const j = await getJson(url);
    const kl = j && j.data && j.data.klines && j.data.klines[0];
    if (!kl) return null;
    const nums = kl.split(',').slice(1).map(Number);
    // f52=主力净流入, f53=小单, f54=中单, f55=大单, f56=超大单 (单位：元)
    const main = nums[0] || 0;
    return {
      mainNetInflow: main, // 元
      retailNetInflow: nums[1] || 0,
      middleNetInflow: nums[2] || 0,
      bigNetInflow: nums[3] || 0,
      hugeNetInflow: nums[4] || 0,
    };
  } catch (e) {
    return null;
  }
}

// 腾讯兜底：仅取价格/涨跌幅（GBK 解码）
async function fetchQuoteFallback(secid) {
  try {
    const prefix = secid.startsWith('1.') ? 'sh' : secid.startsWith('0.') ? 'sz' : secid.startsWith('116.') ? 'hk' : 'us';
    const code = secid.split('.')[1];
    const res = await fetch(`https://qt.gtimg.cn/q=${prefix}${code}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(config.quotes.timeoutMs),
    });
    const buf = await res.arrayBuffer();
    // GBK 解码：优先用 TextDecoder('gbk')（Cloudflare Worker / 现代运行时支持）
    let text;
    try {
      text = new TextDecoder('gbk').decode(buf);
    } catch (e) {
      text = new TextDecoder('utf-8').decode(buf);
    }
    const m = text.match(/="([^"]*)"/);
    if (!m) return null;
    const f = m[1].split('~');
    if (!f[3]) return null;
    return {
      secid,
      code: f[2],
      name: f[1],
      market: marketOf(secid),
      price: num(f[3]),
      changePct: num(f[32]),
      change: num(f[31]),
      turnover: num(f[38]),
      pe: num(f[39]),
      pb: num(f[46]),
      marketCap: 0,
      floatCap: 0,
      amount: 0,
      fallback: true,
    };
  } catch (e) {
    return null;
  }
}

// 抓取单只（行情 + 资金流），含重试与兜底
export async function fetchQuote(secid) {
  if (!secid) return null;
  let q = null;
  for (let i = 0; i <= config.quotes.retries; i++) {
    try {
      q = await fetchQuoteOne(secid);
      if (q) break;
    } catch (e) {
      // 重试
    }
  }
  if (!q) q = await fetchQuoteFallback(secid); // 东方财富失败则腾讯兜底
  if (!q) return null;
  const flow = await fetchFlowOne(secid);
  if (flow) Object.assign(q, flow);
  return q;
}

// 批量抓取（并发）
export async function fetchQuotes(codes) {
  const unique = [...new Set(codes.filter(Boolean))];
  const results = await Promise.all(unique.map((c) => fetchQuote(c).catch(() => null)));
  return results.filter(Boolean);
}

// 大盘指数：腾讯行情 qt.gtimg.cn（GBK，Node22/Cloudflare Workers 均支持解码；全球可达）
// 注：东方财富指数接口从该环境（海外 IP）返回空，雅虎对数据中心 IP 限流 403，故以腾讯为大盘主源。
const INDEX_DEFS = [
  { gtimg: 'sh000001', name: '上证指数' },
  { gtimg: 'sz399001', name: '深证成指' },
  { gtimg: 'sz399006', name: '创业板指' },
  { gtimg: 'hkHSI', name: '恒生指数' },
  { gtimg: 'usIXIC', name: '纳斯达克' },
  { gtimg: 'usINX', name: '标普500' },
];

async function fetchIndexTencent(def) {
  try {
    const res = await fetch(`https://qt.gtimg.cn/q=${def.gtimg}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(config.quotes.timeoutMs),
    });
    const buf = await res.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('gbk').decode(buf);
    } catch (e) {
      text = new TextDecoder('utf-8').decode(buf);
    }
    const m = text.match(/="([^"]*)"/);
    if (!m) return null;
    const f = m[1].split('~');
    if (!f[3]) return null;
    return {
      secid: def.gtimg,
      code: def.gtimg,
      name: def.name,
      market: '指数',
      price: num(f[3]),
      changePct: num(f[32]),
      change: num(f[31]),
    };
  } catch (e) {
    return null;
  }
}

export async function fetchIndices() {
  const out = [];
  await Promise.all(
    INDEX_DEFS.map(async (def) => {
      const q = await fetchIndexTencent(def);
      if (q) out.push(q);
    }),
  );
  return out;
}

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 精选 ETF 池实时行情（聚焦国内板块 + 纳斯达克相关）
// 返回 { domestic:[...], nasdaq:[...], fetchedAt }，每项含真实 price/changePct
export async function fetchEtfs() {
  const cfg = config.etf || {};
  const mapGroup = async (list, category) =>
    Promise.all(
      (list || []).map(async (x) => {
        const q = await fetchQuote(x.secid).catch(() => null);
        return {
          secid: x.secid,
          code: x.code,
          name: x.name,
          sector: x.sector,
          category,
          price: q ? q.price : null,
          changePct: q ? q.changePct : null,
          hasQuote: !!q,
        };
      }),
    );
  const [domestic, nasdaq] = await Promise.all([
    mapGroup(cfg.domestic, '国内'),
    mapGroup(cfg.nasdaq, '纳斯达克相关'),
  ]);
  return { domestic, nasdaq, fetchedAt: new Date().toISOString() };
}

// 强制刷新缓存（用于 ?force=1）
export function clearQuoteCache() {
  quoteCache.clear();
}
