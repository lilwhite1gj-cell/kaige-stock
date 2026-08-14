import { config } from './config.js';
import { categorize } from './categorize.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// ---------- 通用重试包装：超时 + 指数退避 ----------
// fn 接收 AbortSignal；返回非空数组视为成功，空数组触发重试
async function withRetry(name, fn, retries, timeoutMs) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fn(controller.signal);
      clearTimeout(timer);
      if (r && r.length) return r;
      lastErr = new Error(name + ' 返回空数据');
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) {
      const wait = 500 * (attempt + 1); // 退避：0.5s, 1s, ...
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastErr || new Error(name + ' 失败');
}

// 从形如 `var xxx = [...]` 的 JS 赋值语句中稳健提取 JSON 数组文本（兼容嵌套、字符串内的括号）
function extractJsArray(text, varName) {
  const marker = 'var ' + varName + ' = ';
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const start = text.indexOf('[', idx);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"' || ch === "'") inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// ---------- 时间统一处理：全部按北京时间展示，用 UTC 时间戳排序 ----------
function pad(n) {
  return String(n).padStart(2, '0');
}

// 把任意时间输入解析为 UTC 时间戳（毫秒）
// 无显式时区的 `YYYY-MM-DD HH:mm:ss` 一律视为北京时间
function parseTime(input) {
  if (input == null || input === '') return null;

  // 纯数字：Unix 秒或毫秒
  const num = Number(input);
  if (!isNaN(num) && String(input).trim() === String(num)) {
    // 10 位 = 秒，13 位 = 毫秒
    return num < 1e12 ? num * 1000 : num;
  }

  const str = String(input).trim();

  // 无显式时区的北京时间格式：YYYY-MM-DD HH:mm:ss（ Investing/金十 常用）
  const bj = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (bj) {
    const [, y, mo, d, h, mi, s] = bj.map(Number);
    // 北京时间转 UTC：减 8 小时
    return Date.UTC(y, mo - 1, d, h - 8, mi, s);
  }

  // 带时区的标准格式（RFC 822 / ISO / GMT 等）
  const ts = Date.parse(str);
  if (!isNaN(ts)) return ts;

  return null;
}

// 把 UTC 时间戳转为北京时间字符串 YYYY-MM-DD HH:mm:ss
function toBeijingString(ts) {
  const d = new Date(ts);
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
}

// 统一生成时间字段：ts(UTC ms) 用于排序，time(北京时间) 用于展示
function makeTime(raw) {
  const ts = parseTime(raw);
  if (ts) return { ts, time: toBeijingString(ts) };
  const now = Date.now();
  return { ts: now, time: toBeijingString(now) };
}

// ---------- 现有综合财经源（覆盖 A股 / 港股内容） ----------

// 新浪财经 滚动新闻
async function fetchSina(signal) {
  const lids = ['2509', '2511', '2512'];
  let lastErr;
  for (const lid of lids) {
    try {
      const url = `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&k=&num=${config.newsLimit}&page=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn/' },
        signal,
      });
      if (!res.ok) throw new Error('sina http ' + res.status);
      const json = await res.json();
      const list = (json && json.result && json.result.data) || [];
      if (!list.length) continue;
      return list.map((it) => {
        const t = makeTime(it.ctime);
        return {
          id: String(it.id || it.url || it.title),
          title: String(it.title || '').trim(),
          url: it.url || '',
          ts: t.ts,
          time: t.time,
          source: it.media || '新浪财经',
          intro: String(it.intro || it.summary || '').trim(),
        };
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('sina 无可用数据');
}

// 东方财富 7x24 快讯
async function fetchEastmoney(signal) {
  const r = Math.random().toFixed(3);
  const url = `https://newsapi.eastmoney.com/kuaixun/v1/getlist?type=1&page=1&pagesize=${config.newsLimit}&r=${r}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://kuaixun.eastmoney.com/' },
    signal,
  });
  if (!res.ok) throw new Error('eastmoney http ' + res.status);
  const json = await res.json();
  const list = (json && json.data && json.data.list) || [];
  if (!list.length) throw new Error('eastmoney 空数据');
  return list.map((it) => {
    const t = makeTime(it.datetime || it.time);
    return {
      id: String(it.id || it.unique_id || it.title),
      title: String(it.title || '').trim(),
      url: it.url || (it.id ? `https://kuaixun.eastmoney.com/${it.id}` : ''),
      ts: t.ts,
      time: t.time,
      source: '东方财富',
      intro: String(it.content || it.summary || '').trim(),
    };
  });
}

// 财联社 电报
async function fetchCls(signal) {
  const url =
    'https://www.cls.cn/nodeapi/updateTelegraphList?app=web&lastTime=0&refresh=1&fields=title,content,datetime,stockCodes';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.cls.cn/telegraph' },
    signal,
  });
  if (!res.ok) throw new Error('cls http ' + res.status);
  const json = await res.json();
  let list = (json && json.data && (json.data.rollData || json.data.list || json.data.telegraphList)) || [];
  if (Array.isArray(json && json.data)) list = json.data;
  if (!Array.isArray(list) || !list.length) throw new Error('cls 空数据');
  return list.slice(0, config.newsLimit).map((it) => {
    const t = makeTime(it.datetime || it.time);
    return {
      id: String(it.id || it.title),
      title: String(it.title || '').trim(),
      url: it.url || (it.id ? `https://www.cls.cn/${it.id}` : ''),
      ts: t.ts,
      time: t.time,
      source: '财联社',
      intro: String(it.content || it.summary || '').trim(),
    };
  });
}

// 巨潮资讯网 最新公告（A股）
async function fetchCninfo(signal) {
  const url = 'https://www.cninfo.com.cn/new/hisAnnouncement/query';
  const body = new URLSearchParams({
    pageNum: '1',
    pageSize: '30',
    column: 'sse_latest',
    tabName: 'latest',
    sortName: '',
    sortType: '',
    isHL: '',
    stock: '',
    seDate: '',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': UA,
      Referer: 'https://www.cninfo.com.cn/new/disclosure/stock',
    },
    body,
    signal,
  });
  if (!res.ok) throw new Error('cninfo http ' + res.status);
  const json = await res.json();
  const list = (json && json.announcements) || [];
  if (!list.length) throw new Error('cninfo 空数据');
  return list.map((it) => {
    const t = makeTime(it.announcementTime);
    return {
      id: String(it.announcementId || it.announcementTitle),
      title: String(it.announcementTitle || '').trim(),
      url: 'https://www.cninfo.com.cn/new/disclosure/detail?announcementId=' + (it.announcementId || ''),
      ts: t.ts,
      time: t.time,
      source: '巨潮(巨浪)资讯',
      intro: '证券代码：' + (it.stockCode || '-') + ' ' + (it.stockShortName || ''),
    };
  });
}

// ---------- 新增：港股数据源 ----------

// 新浪港股 滚动新闻
async function fetchSinaHK(signal) {
  const lids = ['2510'];
  let lastErr;
  for (const lid of lids) {
    try {
      const url = `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&k=&num=${config.newsLimit}&page=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn/stock/hk/' },
        signal,
      });
      if (!res.ok) throw new Error('sinahk http ' + res.status);
      const json = await res.json();
      const list = (json && json.result && json.result.data) || [];
      if (!list.length) continue;
      return list.map((it) => {
        const t = makeTime(it.ctime);
        return {
          id: String(it.id || it.url || it.title),
          title: String(it.title || '').trim(),
          url: it.url || '',
          ts: t.ts,
          time: t.time,
          source: '新浪港股',
          intro: String(it.intro || it.summary || '').trim(),
        };
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('sinahk 无可用数据');
}

// ---------- 新增：美股数据源（RSS，海外节点友好） ----------

// 解析 RSS <item> 块为统一字段
function parseRss(xml, sourceName, limit) {
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  if (!blocks.length) throw new Error(sourceName + ' 无 item');
  const items = blocks
    .map((m) => {
      const b = m[1];
      const tag = (t) => {
        const r = new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>', 'i').exec(b);
        return r ? r[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : '';
      };
      const title = tag('title');
      const link = tag('link');
      const pub = tag('pubDate');
      const desc = tag('description').replace(/<[^>]+>/g, '').slice(0, 220);
      const t = makeTime(pub);
      return {
        id: link || title,
        title,
        url: link,
        ts: t.ts,
        time: t.time,
        source: sourceName,
        intro: desc,
      };
    })
    .filter((it) => it.title);
  if (!items.length) throw new Error(sourceName + ' 空数据');
  return items.slice(0, limit);
}

// Yahoo Finance 美股 RSS
async function fetchYahooUS(signal) {
  const res = await fetch('https://finance.yahoo.com/news/rssindex', {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
    signal,
  });
  if (!res.ok) throw new Error('yahoo http ' + res.status);
  const xml = await res.text();
  return parseRss(xml, 'Yahoo Finance', config.newsLimit);
}

// Investing.com 市场快讯（美股 / 港股），海外节点可达性较好
async function fetchInvesting(signal) {
  const res = await fetch('https://www.investing.com/rss/news_25.rss', {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
    signal,
  });
  if (!res.ok) throw new Error('investing http ' + res.status);
  const xml = await res.text();
  return parseRss(xml, 'Investing.com', config.newsLimit);
}

// CNBC 美股 Top News（冗余备份，提升海外可达性）
async function fetchCnbc(signal) {
  const res = await fetch(
    'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, signal }
  );
  if (!res.ok) throw new Error('cnbc http ' + res.status);
  const xml = await res.text();
  return parseRss(xml, 'CNBC', config.newsLimit);
}

// ---------- 新增：A股/综合源（同花顺、金十） ----------

// 同花顺 7x24 快讯（综合 / A股 / 港股）
async function fetchThs(signal) {
  const url =
    'https://news.10jqka.com.cn/tapp/news/push/stock/?type=stock&num=' +
    config.newsLimit +
    '&pagesize=' +
    config.newsLimit +
    '&page=1&last_time=0&r=0';
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://news.10jqka.com.cn/',
      Accept: 'application/json, text/plain, */*',
    },
    signal,
  });
  if (!res.ok) throw new Error('ths http ' + res.status);
  const json = await res.json();
  // 兼容多种返回结构
  let list = [];
  if (json && json.data) {
    if (Array.isArray(json.data)) list = json.data;
    else if (Array.isArray(json.data.list)) list = json.data.list;
    else if (Array.isArray(json.data.items)) list = json.data.items;
  } else if (Array.isArray(json)) {
    list = json;
  }
  if (!list.length) throw new Error('ths 空数据');
  return list
    .slice(0, config.newsLimit)
    .map((it) => {
      const t = makeTime(it.ctime || it.rtime || it.datetime || it.time || it.date);
      const title = String(it.title || it.content || it.digest || '').trim();
      const content = String(it.content || it.summary || it.digest || '').trim();
      return {
        id: String(it.id || it.news_id || title),
        title,
        url: it.url || it.link || '',
        ts: t.ts,
        time: t.time,
        source: '同花顺',
        intro: content && content !== title ? content : '',
      };
    })
    .filter((it) => it.title);
}

// 金十数据 快讯（综合 / A股）
async function fetchJin10(signal) {
  const url = 'https://www.jin10.com/flash_newest.js';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.jin10.com/', Accept: '*/*' },
    signal,
  });
  if (!res.ok) throw new Error('jin10 http ' + res.status);
  const text = await res.text();
  // 真实返回为 `var newest = [{...}]`（JS 变量赋值，非 JSONP），需提取数组后解析
  const arrText = extractJsArray(text, 'newest');
  if (!arrText) throw new Error('jin10 非预期格式');
  let arr;
  try {
    arr = JSON.parse(arrText);
  } catch (e) {
    throw new Error('jin10 解析失败: ' + e.message);
  }
  if (!Array.isArray(arr) || !arr.length) throw new Error('jin10 空数据');
  return arr
    .slice(0, config.newsLimit)
    .map((it) => {
      const d = it.data || {};
      const title = String(d.title || d.content || '').trim();
      const content = String(d.content || d.title || '').trim();
      const t = makeTime(it.time);
      return {
        id: String(it.id || title),
        title,
        url: d.source_link || '',
        ts: t.ts,
        time: t.time,
        source: '金十数据',
        intro: content && content !== title ? content : '',
      };
    })
    .filter((it) => it.title);
}

// ---------- 数据源注册表（按市场标签归类） ----------
export const SOURCES = [
  { id: 'sina', name: '新浪财经', markets: ['综合', 'A股', '港股'], fetch: fetchSina },
  { id: 'eastmoney', name: '东方财富', markets: ['综合', 'A股', '港股'], fetch: fetchEastmoney },
  { id: 'cls', name: '财联社', markets: ['综合', 'A股', '港股'], fetch: fetchCls },
  { id: 'cninfo', name: '巨潮(巨浪)资讯', markets: ['A股'], fetch: fetchCninfo },
  { id: 'sinahk', name: '新浪港股', markets: ['港股'], fetch: fetchSinaHK },
  { id: 'yahoo', name: 'Yahoo Finance', markets: ['美股'], fetch: fetchYahooUS },
  { id: 'investing', name: 'Investing.com', markets: ['综合', '美股', '港股'], fetch: fetchInvesting },
  { id: 'cnbc', name: 'CNBC', markets: ['美股'], fetch: fetchCnbc },
  { id: 'ths', name: '同花顺', markets: ['综合', 'A股', '港股'], fetch: fetchThs },
  { id: 'jin10', name: '金十数据', markets: ['综合', 'A股'], fetch: fetchJin10 },
];

// 兜底示例数据：当所有实时源都不可用时，保证页面有内容
function fallbackItems() {
  const now = Date.now();
  const base = [
    ['科技', 'AI算力需求爆发，半导体板块迎来国产替代窗口期', '多家机构指出，人工智能训练与推理需求持续高增，带动先进制程与封测订单饱满，国产芯片产业链景气度上行。', '示例数据'],
    ['金融', '央行维持流动性合理充裕，银行板块估值修复可期', '最新货币政策例会强调保持流动性合理充裕，市场预计信贷成本边际改善，利好银行净息差企稳。', '示例数据'],
    ['消费', '暑期出游旺季来临，旅游与免税板块景气度回升', '暑期出行订单同比大幅增长，头部免税运营商客流恢复，消费复苏主线再次受到关注。', '示例数据'],
    ['医药', '创新药出海提速，CXO与生物制药板块情绪回暖', '近期多款国产创新药达成对外授权合作，验证研发实力，相关产业链公司关注度提升。', '示例数据'],
    ['新能源', '储能装机超预期，锂电与光伏产业链排产回升', '新型储能政策落地推动装机放量，上游材料价格企稳，板块盈利预期边际改善。', '示例数据'],
    ['地产', '核心城市优化限购政策，地产链迎来估值修复', '部分核心城市因城施策优化购房条件，建材、家居等后周期品种需求预期改善。', '示例数据'],
    ['军工', '装备现代化加速，军工电子与航天板块订单饱满', '国防开支稳步增长，信息化与精确制导方向订单确定性较强，板块具备配置价值。', '示例数据'],
  ];
  return base.map((b, i) => ({
    id: 'fallback-' + i,
    title: b[1],
    url: '',
    ts: now - i * 3600 * 1000,
    time: toBeijingString(now - i * 3600 * 1000),
    source: b[3],
    intro: b[2],
  }));
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = (it.url || it.title).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// 轻量打散：当同一来源连续出现超过阈值时，把后续条目往后挪，让其它源有机会插在前面
function interleaveBySource(items, maxSameSource = 3) {
  if (!items.length) return items;
  const out = [items[0]];
  const pending = items.slice(1);
  while (pending.length) {
    const lastSrc = out[out.length - 1].source || '其他';
    const sameStreak = out.slice(-maxSameSource).every((x) => (x.source || '其他') === lastSrc);

    // 找下一个可用的不同源条目；如果不需要打散或找不到，就取队首
    let idx = 0;
    if (sameStreak) {
      const alt = pending.findIndex((x) => (x.source || '其他') !== lastSrc);
      if (alt >= 0) idx = alt;
    }
    out.push(pending.splice(idx, 1)[0]);
  }
  return out;
}

// 主入口：抓取并分类，返回 { items, isFallback, sources, fetchedAt, diagnostics }
export async function fetchAll() {
  const ds = config.dataSources || {};
  const enabledMarkets = ds.markets || [];
  const strategy = ds.strategy || 'merge';
  const retries = ds.retries ?? 1;
  const timeoutMs = ds.timeoutMs ?? 10000;

  // 市场筛选：未指定市场 = 启用全部；否则只启用 markets 覆盖的源
  const active = SOURCES.filter(
    (s) => !enabledMarkets.length || s.markets.some((m) => enabledMarkets.includes(m))
  );

  const sources = [];
  const diagnostics = [];
  let items = [];

  // 并发抓取所有启用源：总耗时≈最慢单源，避免顺序累加超时（海外节点/Render 休眠场景尤其重要）
  const settled = await Promise.allSettled(
    active.map(async (s) => {
      const t0 = Date.now();
      try {
        const got = await withRetry(s.name, (signal) => s.fetch(signal), retries, timeoutMs);
        return { s, got, ms: Date.now() - t0, err: null };
      } catch (e) {
        return { s, got: null, ms: Date.now() - t0, err: e };
      }
    })
  );

  for (const r of settled) {
    const { s, got, ms, err } =
      r.status === 'fulfilled'
        ? r.value
        : { s: null, got: null, ms: 0, err: new Error('未知错误') };
    if (!s) continue;

    if (err || !got || !got.length) {
      diagnostics.push({
        source: s.name,
        status: 'fail',
        count: 0,
        ms,
        error: String((err && err.message) || err),
      });
      continue;
    }

    diagnostics.push({ source: s.name, status: 'ok', count: got.length, ms });

    if (strategy === 'priority') {
      // 单源切换：只取第一个成功的源，其余忽略
      if (!items.length) {
        items = got;
        sources.push(s.name);
      }
    } else {
      // 合并：所有成功源的结果汇总
      items = items.concat(got);
      sources.push(s.name);
    }
  }

  let isFallback = false;
  if (!items.length) {
    items = fallbackItems();
    isFallback = true;
    sources.length = 0;
    sources.push('示例数据（实时源暂不可用）');
  }

  items = dedupe(items)
    .filter((it) => it.title)
    .map((it) => {
      const sec = categorize(it.title + ' ' + it.intro);
      return { ...it, sectorKey: sec.key, sectorName: sec.name };
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, config.newsLimit);

  // 在严格时序排序基础上，轻微打散同一源连续扎堆（最多连续 3 条）
  items = interleaveBySource(items, 3);

  return {
    items,
    isFallback,
    sources,
    fetchedAt: new Date().toISOString(),
    diagnostics,
  };
}

export {
  fetchSina,
  fetchEastmoney,
  fetchCls,
  fetchCninfo,
  fetchSinaHK,
  fetchYahooUS,
  fetchInvesting,
  fetchCnbc,
  fetchThs,
  fetchJin10,
};
