'use strict';

const config = require('./config');
const { categorize } = require('./categorize');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 新浪财经 滚动新闻（多个 lid 尝试）
async function fetchSina() {
  const lids = ['2509', '2511', '2512'];
  let lastErr;
  for (const lid of lids) {
    try {
      const url = `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&k=&num=${config.newsLimit}&page=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn/' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('sina http ' + res.status);
      const json = await res.json();
      const list = (json && json.result && json.result.data) || [];
      if (!list.length) continue;
      return list.map((it) => {
        const ctime = parseInt(it.ctime, 10);
        return {
          id: String(it.id || it.url || it.title),
          title: String(it.title || '').trim(),
          url: it.url || '',
          time: ctime ? new Date(ctime * 1000).toISOString() : new Date().toISOString(),
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
async function fetchEastmoney() {
  const r = Math.random().toFixed(3);
  const url = `https://newsapi.eastmoney.com/kuaixun/v1/getlist?type=1&page=1&pagesize=${config.newsLimit}&r=${r}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://kuaixun.eastmoney.com/' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('eastmoney http ' + res.status);
  const json = await res.json();
  const list = (json && json.data && json.data.list) || [];
  if (!list.length) throw new Error('eastmoney 空数据');
  return list.map((it) => {
    const ts = parseInt(it.datetime || it.time, 10);
    return {
      id: String(it.id || it.unique_id || it.title),
      title: String(it.title || '').trim(),
      url: it.url || (it.id ? `https://kuaixun.eastmoney.com/${it.id}` : ''),
      time: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
      source: '东方财富',
      intro: String(it.content || it.summary || '').trim(),
    };
  });
}

// 财联社 电报
async function fetchCls() {
  const url =
    'https://www.cls.cn/nodeapi/updateTelegraphList?app=web&lastTime=0&refresh=1&fields=title,content,datetime,stockCodes';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.cls.cn/telegraph' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('cls http ' + res.status);
  const json = await res.json();
  let list = (json && json.data && (json.data.rollData || json.data.list || json.data.telegraphList)) || [];
  if (Array.isArray(json && json.data)) list = json.data;
  if (!Array.isArray(list) || !list.length) throw new Error('cls 空数据');
  return list.slice(0, config.newsLimit).map((it) => {
    const ts = parseInt(it.datetime || it.time, 10);
    return {
      id: String(it.id || it.title),
      title: String(it.title || '').trim(),
      url: it.url || (it.id ? `https://www.cls.cn/${it.id}` : ''),
      time: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
      source: '财联社',
      intro: String(it.content || it.summary || '').trim(),
    };
  });
}

// 巨潮资讯网 最新公告（POST 接口，失败时静默跳过）
async function fetchCninfo() {
  try {
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
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('cninfo http ' + res.status);
    const json = await res.json();
    const list = (json && json.announcements) || [];
    if (!list.length) return [];
    return list.map((it) => ({
      id: String(it.announcementId || it.announcementTitle),
      title: String(it.announcementTitle || '').trim(),
      url: 'https://www.cninfo.com.cn/new/disclosure/detail?announcementId=' + (it.announcementId || ''),
      time: it.announcementTime ? new Date(it.announcementTime.replace(/-/g, '/')).toISOString() : new Date().toISOString(),
      source: '巨潮资讯',
      intro: '证券代码：' + (it.stockCode || '-') + ' ' + (it.stockShortName || ''),
    }));
  } catch (e) {
    // 巨潮资讯接口较严格，失败时返回空，不影响主流程
    return [];
  }
}

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
    time: new Date(now - i * 3600 * 1000).toISOString(),
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

// 主入口：抓取并分类，返回 { items, isFallback, sources, fetchedAt }
async function fetchAll() {
  const sources = [];
  let items = [];

  // 各数据源独立容错，任一失败不影响其它源
  const sources_fns = [
    ['新浪财经', fetchSina],
    ['东方财富', fetchEastmoney],
    ['财联社', fetchCls],
    ['巨潮资讯', fetchCninfo],
  ];
  for (const [name, fn] of sources_fns) {
    try {
      const got = await fn();
      if (got && got.length) {
        items = items.concat(got);
        sources.push(name);
      }
    } catch (e) {
      // 忽略单源失败
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
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, config.newsLimit);

  return {
    items,
    isFallback,
    sources,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchAll, fetchSina, fetchEastmoney, fetchCls, fetchCninfo };
