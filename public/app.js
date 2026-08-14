'use strict';

const state = {
  sectors: [],
  news: [],
  activeSector: 'all',
  aiEnabled: false,
  hasKey: false,
  page: 1,
  pageSize: 10,
  analysis: null,
  selectedMarkets: [],
  reco: null,
  liveQuotes: null,
  etfQuotes: null,
  lastRecoUpdate: null,
};

const MARKET_OPTIONS = ['A股', '港股', '美股', '其他'];

function marketOf(s) {
  return MARKET_OPTIONS.includes(s && s.market) ? s.market : '其他';
}
function recommendIndexOf(s) {
  if (typeof s.recommendIndex === 'number' && s.recommendIndex > 0) return s.recommendIndex;
  if (s.grade === '推荐投资个股') return 90;
  if (s.grade === '少量持有个股') return 60;
  return 30;
}
function sortByIndexDesc(arr) {
  return (arr || []).slice().sort((a, b) => recommendIndexOf(b) - recommendIndexOf(a));
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(iso) {
  if (!iso) return '';
  // 后端统一返回北京时间字符串 YYYY-MM-DD HH:mm:ss，直接截取显示，避免浏览器时区差异
  const s = String(iso).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  // 兜底：兼容旧的 ISO 时间
  const d = new Date(s);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

// ===== 新闻 =====
function renderSectorTabs() {
  const tabs = document.getElementById('sectorTabs');
  const all = [{ key: 'all', name: '全部' }].concat(state.sectors);
  tabs.innerHTML = all
    .map(
      (s) =>
        `<span class="chip ${state.activeSector === s.key ? 'active' : ''}" data-key="${esc(s.key)}">${esc(
          s.name
        )}</span>`
    )
    .join('');
  tabs.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      state.activeSector = c.dataset.key;
      state.page = 1;
      renderSectorTabs();
      renderNews();
    });
  });
}

function renderNews() {
  const list = document.getElementById('newsList');
  let items = state.news;
  if (state.activeSector !== 'all') {
    items = items.filter((n) => n.sectorKey === state.activeSector);
  }
  const total = items.length;
  const pageSize = state.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  if (!total) {
    list.innerHTML = '<div class="placeholder">该板块暂无相关新闻</div>';
    renderPager(0, 0);
    return;
  }
  const start = (state.page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  list.innerHTML =
    pageItems
      .map((n) => {
        const titleHtml = n.url
          ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>`
          : esc(n.title);
        return `<div class="news-card">
        <p class="news-title">${titleHtml}</p>
        <p class="news-intro">${esc(n.intro || '')}</p>
        <div class="news-foot">
          <span class="tag">${esc(n.sectorName || '其他')}</span>
          <span>📰 ${esc(n.source || '')}</span>
          <span>🕒 ${esc(fmtTime(n.time))}</span>
        </div>
      </div>`;
      })
      .join('') || '<div class="placeholder">该板块暂无相关新闻</div>';

  renderPager(total, totalPages);
}

function renderPager(total, totalPages) {
  const pager = document.getElementById('newsPager');
  if (!pager) return;
  if (total === 0 || totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }
  const page = state.page;
  const maxBtns = 7;
  let from = Math.max(1, page - 3);
  let to = Math.min(totalPages, from + maxBtns - 1);
  from = Math.max(1, to - maxBtns + 1);
  let nums = '';
  for (let i = from; i <= to; i++) {
    nums += `<button class="pg-num ${i === page ? 'active' : ''}" data-pg="${i}">${i}</button>`;
  }
  pager.innerHTML = `
    <button class="pg-btn" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>‹ 上一页</button>
    <span class="pg-nums">${nums}</span>
    <button class="pg-btn" data-pg="next" ${page >= totalPages ? 'disabled' : ''}>下一页 ›</button>
    <span class="pg-info">第 ${page} / ${totalPages} 页 · 共 ${total} 条</span>
    <label class="pg-size-wrap">每页
      <select class="pg-size" id="pgSize">
        <option value="10" ${state.pageSize === 10 ? 'selected' : ''}>10</option>
        <option value="20" ${state.pageSize === 20 ? 'selected' : ''}>20</option>
        <option value="30" ${state.pageSize === 30 ? 'selected' : ''}>30</option>
        <option value="50" ${state.pageSize === 50 ? 'selected' : ''}>50</option>
      </select> 条
    </label>
  `;
  pager.querySelectorAll('[data-pg]').forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.pg;
      if (v === 'prev') state.page = Math.max(1, state.page - 1);
      else if (v === 'next') state.page = Math.min(totalPages, state.page + 1);
      else state.page = parseInt(v, 10);
      renderNews();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  const sizeSel = document.getElementById('pgSize');
  if (sizeSel) {
    sizeSel.addEventListener('change', () => {
      state.pageSize = parseInt(sizeSel.value, 10);
      state.page = 1;
      renderNews();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

// ===== AI 分析 =====
function gradeClass(grade) {
  if (grade === '推荐投资个股') return 'grade-up';
  if (grade === '少量持有个股') return 'grade-mid';
  return 'grade-down';
}
function actionBadge(action) {
  if (action === '买入') return '<span class="badge badge-buy">买入</span>';
  if (action === '持有') return '<span class="badge badge-hold">持有</span>';
  if (action === '定投') return '<span class="badge badge-dca">定投</span>';
  return '<span class="badge badge-avoid">回避</span>';
}

function renderAnalysis(a) {
  if (a && a.stocks) state.analysis = a;
  a = state.analysis || a;
  const box = document.getElementById('aiContent');
  if (a && a.snapshotNote) {
    box.innerHTML = `<div class="placeholder">
      云端静态版不包含实时 AI 分析。<br/>请在完整版（<code>node server.js</code>）中配置 DeepSeek API Key 后查看 <b>个股投资分级</b> 与 <b>每日 ETF 板块建议</b>。
    </div>`;
    return;
  }
  if (!state.aiEnabled) {
    box.innerHTML = `<div class="placeholder">
      AI 智能分析已关闭。<br/>打开右上角「AI 分析」开关，即可查看 <b>个股投资分级</b> 与 <b>每日 ETF 板块建议</b>。
    </div>`;
    return;
  }
  if (a && a.noKey) {
    box.innerHTML = `<div class="placeholder">
      尚未配置 DeepSeek API Key。<br/>
      请在项目根目录 <code>.env</code> 中填入 <code>DEEPSEEK_API_KEY=你的密钥</code> 后重启服务。
    </div>`;
    return;
  }
  if (a && a.error) {
    box.innerHTML = `<div class="placeholder">AI 分析生成失败（${esc(a.error)}），请稍后重试或检查 API Key。</div>`;
    return;
  }
  if (!a || !a.stocks) {
    box.innerHTML = `<div class="placeholder">AI 分析尚未生成，请稍候或点击「刷新」。</div>`;
    return;
  }

  // 市场筛选：未选任何 = 全部
  const stocks = (a.stocks || []).filter((s) => {
    if (!state.selectedMarkets.length) return true;
    return state.selectedMarkets.includes(marketOf(s));
  });

  // 分组 + 板块内按推荐指数降序
  const groups = {
    up: sortByIndexDesc(stocks.filter((s) => s.grade === '推荐投资个股')),
    mid: sortByIndexDesc(stocks.filter((s) => s.grade === '少量持有个股')),
    down: sortByIndexDesc(stocks.filter((s) => s.grade === '高风险个股' || !s.grade)),
  };

  const stockCard = (s) =>
    `<div class="stock-item">
      <div class="stock-name">${esc(s.name || '—')}</div>
      <div class="stock-sector">${esc(s.sector || '')}${s.market ? ' · ' + esc(marketOf(s)) : ''}</div>
      <div class="stock-rank">推荐指数 ${recommendIndexOf(s)}</div>
      <div class="stock-reason">${esc(s.reason || '')}</div>
    </div>`;

  const col = (cls, title, arr) =>
    `<div class="grade-col ${cls}">
      <h3>${esc(title)} <span style="font-weight:400;font-size:12px">(${arr.length})</span></h3>
      ${
        arr.length
          ? `<div class="stock-row">${arr.map(stockCard).join('')}</div>`
          : '<div class="stock-reason">暂无</div>'
      }
    </div>`;

  const summary = a.summary ? `<div class="summary-box">📊 ${esc(a.summary)}</div>` : '';

  const marketFilterHtml = ['全部'].concat(MARKET_OPTIONS)
    .map((m) => {
      const active = m === '全部' ? state.selectedMarkets.length === 0 : state.selectedMarkets.includes(m);
      return `<span class="mchip ${active ? 'active' : ''}" data-m="${esc(m)}">${esc(m)}</span>`;
    })
    .join('');

  box.innerHTML = `
    ${summary}
    <h3 style="margin:0 0 4px;font-size:15px;">个股投资分级</h3>
    <div class="market-filter" id="marketFilter"><span class="mf-label">市场：</span>${marketFilterHtml}</div>
    <div class="grade-grid">
      ${col('grade-up', '✅ 推荐投资个股', groups.up)}
      ${col('grade-mid', '⚠️ 少量持有个股', groups.mid)}
      ${col('grade-down', '🚫 高风险个股', groups.down)}
    </div>
  `;

  // 市场筛选交互
  const mf = document.getElementById('marketFilter');
  if (mf) {
    mf.querySelectorAll('.mchip').forEach((c) => {
      c.addEventListener('click', () => {
        const m = c.dataset.m;
        if (m === '全部') {
          state.selectedMarkets = [];
        } else {
          const i = state.selectedMarkets.indexOf(m);
          if (i >= 0) state.selectedMarkets.splice(i, 1);
          else state.selectedMarkets.push(m);
        }
        renderAnalysis();
      });
    });
  }
}

// ===== ETF 板块推荐（国内 + 纳斯达克相关） =====
function getLiveEtfByCode(code) {
  const all = [
    ...(state.etfQuotes && state.etfQuotes.domestic ? state.etfQuotes.domestic : []),
    ...(state.etfQuotes && state.etfQuotes.nasdaq ? state.etfQuotes.nasdaq : []),
  ];
  return all.find((x) => x.code === code) || null;
}

function etfCard(e) {
  const live = getLiveEtfByCode(e.code);
  const price = live && live.price != null ? live.price : e.price;
  const chg = live && live.changePct != null ? live.changePct : e.changePct;
  const chgCls = chg == null ? 'flat' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
  const chgStr = chg == null ? '—' : (chg > 0 ? '+' : '') + chg.toFixed(2) + '%';
  const pxStr = price == null ? '—' : price > 100 ? price.toFixed(2) : price.toFixed(3);
  return `<div class="etf-card" data-code="${esc(e.code || '')}">
    <div class="etf-top"><span class="etf-name">${esc(e.name || 'ETF')}</span>${actionBadge(e.action)}</div>
    <div class="etf-code">${esc(e.code || '')}</div>
    <div class="etf-price"><span class="etf-px ${chgCls}">${pxStr}</span> <span class="etf-chg ${chgCls}">${chgStr}</span></div>
    <div class="etf-reason">${esc(e.logic || '')}</div>
  </div>`;
}

function renderEtf(a) {
  const box = document.getElementById('etfContent');
  if (!box) return;
  if (a && a.snapshotNote) {
    box.innerHTML = '<div class="placeholder">云端静态版不包含 ETF 板块推荐。请在完整版（<code>node server.js</code>）配置 DeepSeek Key 后查看。</div>';
    return;
  }
  if (!state.aiEnabled) {
    box.innerHTML = '<div class="placeholder">AI 分析已关闭。打开右上角「AI 分析」开关即可查看 ETF 板块推荐。</div>';
    return;
  }
  if (a && a.noKey) {
    box.innerHTML = '<div class="placeholder">尚未配置 DeepSeek API Key，无法生成 ETF 推荐。<br/>请在 <code>.env</code> 中填入 <code>DEEPSEEK_API_KEY</code> 后重启服务。</div>';
    return;
  }
  if (a && a.error) {
    box.innerHTML = `<div class="placeholder">ETF 推荐生成失败（${esc(a.error)}），请稍后重试。</div>`;
    return;
  }
  const etfs = (a && a.etfs) || [];
  if (!etfs.length) {
    box.innerHTML = '<div class="placeholder">ETF 推荐尚未生成，请稍候或点击「刷新」。</div>';
    return;
  }

  const cats = ['国内', '纳斯达克相关'];
  const catTitles = { 国内: '🇨🇳 国内板块 ETF', '纳斯达克相关': '🌐 纳斯达克相关 ETF' };
  let html = '';
  for (const cat of cats) {
    const list = etfs.filter((e) => e.category === cat);
    if (!list.length) continue;
    // 板块分类：按 sector 分组
    const sectors = {};
    list.forEach((e) => {
      const k = e.sector || '其他';
      (sectors[k] = sectors[k] || []).push(e);
    });
    let secHtml = '';
    for (const sec of Object.keys(sectors)) {
      secHtml += `<div class="etf-sector-group">
        <div class="etf-sector-title">${esc(sec)}</div>
        <div class="etf-card-row">${sectors[sec].map(etfCard).join('')}</div>
      </div>`;
    }
    html += `<div class="etf-cat"><h3 class="etf-cat-title">${catTitles[cat]}</h3>${secHtml}</div>`;
  }
  box.innerHTML = html;
}

// 实时行情轮询：拉取最新 ETF 价/涨跌并就地更新卡片（不整页重渲染）
async function loadEtfQuotes() {
  try {
    const d = await api('/api/etf-quotes');
    state.etfQuotes = d;
    updateEtfPrices();
  } catch (e) {
    // 静默失败，下次轮询重试
  }
}

function updateEtfPrices() {
  if (!state.etfQuotes) return;
  const all = [
    ...(state.etfQuotes.domestic || []),
    ...(state.etfQuotes.nasdaq || []),
  ];
  document.querySelectorAll('.etf-card[data-code]').forEach((card) => {
    const q = all.find((x) => x.code === card.dataset.code);
    if (!q) return;
    const px = card.querySelector('.etf-px');
    const chg = card.querySelector('.etf-chg');
    if (q.price != null && px) {
      px.textContent = q.price > 100 ? q.price.toFixed(2) : q.price.toFixed(3);
      px.className = 'etf-px ' + signClass(q.changePct);
    }
    if (q.changePct != null && chg) {
      const v = q.changePct;
      chg.textContent = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
      chg.className = 'etf-chg ' + signClass(v);
    }
  });
}

// ===== 综合荐股（新闻 × 行情） =====
function signClass(v) {
  if (v == null) return 'flat';
  if (v > 0) return 'up'; // 涨 = 红（A股习惯）
  if (v < 0) return 'down'; // 跌 = 绿
  return 'flat';
}
function fmtPct(v) {
  if (v == null) return '—';
  return (v > 0 ? '+' : '') + v + '%';
}
function fmtYi(v) {
  if (v == null) return '—';
  const s = (v > 0 ? '+' : '') + v + '亿';
  return s;
}
function actionClass(a) {
  if (a === '买入') return 'badge-buy';
  if (a === '持有') return 'badge-hold';
  return 'badge-sell';
}
function signalTag(label, val) {
  if (!val) return '';
  const cls =
    val === '正面' || val === '强势'
      ? 'sig-up'
      : val === '负面' || val === '弱势'
        ? 'sig-down'
        : 'sig-mid';
  return `<span class="sig ${cls}">${esc(label)}：${esc(val)}</span>`;
}

function renderRecoCombined() {
  const a = state.reco;
  const box = document.getElementById('recoList');
  const sentimentEl = document.getElementById('marketSentiment');
  const chipsEl = document.getElementById('indexChips');
  if (!box) return;

  // 大盘研判
  if (a && a.market && a.market.sentiment) {
    const sc =
      a.market.sentiment === '偏多' ? 'sig-up' : a.market.sentiment === '偏空' ? 'sig-down' : 'sig-mid';
    sentimentEl.innerHTML = `<span class="sig ${sc}">大盘研判：${esc(a.market.sentiment)}</span> <span class="sentiment-note">${esc(
      a.market.note || '',
    )}</span>`;
  } else {
    sentimentEl.innerHTML = '';
  }

  // 指数 chips（实时）
  const idx = (state.liveQuotes && state.liveQuotes.indices) || [];
  chipsEl.innerHTML = idx.length
    ? idx
        .map(
          (i) =>
            `<span class="idx-chip ${signClass(i.changePct)}">${esc(i.name)} <b>${fmtPct(i.changePct)}</b></span>`,
        )
        .join('')
    : '';

  if (!a) {
    box.innerHTML = '<div class="placeholder">综合推荐尚未生成，请稍候或点击「刷新」。</div>';
    return;
  }
  if (a.noKey) {
    box.innerHTML =
      '<div class="placeholder">尚未配置 DeepSeek API Key，无法生成综合推荐。<br/>请在项目根目录 <code>.env</code> 中填入 <code>DEEPSEEK_API_KEY</code> 后重启服务。</div>';
    return;
  }
  if (a.error) {
    box.innerHTML = `<div class="placeholder">综合推荐生成失败（${esc(a.error)}），请稍后重试。</div>`;
    return;
  }
  const list = a.recommendations || [];
  if (!list.length) {
    box.innerHTML = '<div class="placeholder">暂无可推荐标的。</div>';
    return;
  }

  // 用实时行情覆盖每只推荐标的的价/涨跌/资金（按代码匹配）
  const mb = {};
  (state.liveQuotes && state.liveQuotes.stocks ? state.liveQuotes.stocks : []).forEach((q) => {
    mb[q.code] = q;
  });

  box.innerHTML = list
    .map((r) => {
      const q = r.code && mb[r.code] ? mb[r.code] : null;
      const price = q ? q.price : r.price;
      const chg = q ? q.changePct : r.changePct;
      const inflow = q ? q.mainNetInflow : r.mainNetInflow;
      const turnover = q ? q.turnover : r.turnover;
      const score = typeof r.score === 'number' ? r.score : 50;
      const sc2 = score >= 70 ? 'sig-up' : score >= 40 ? 'sig-mid' : 'sig-down';
      return `<div class="reco-card" data-code="${esc(r.code || '')}">
        <div class="reco-head">
          <div class="reco-name">${esc(r.name || '—')}<span class="reco-code">${esc(r.code || '')}</span><span class="reco-mkt">${esc(
            r.market || '',
          )}</span></div>
          <span class="badge ${actionClass(r.action)}">${esc(r.action || '持有')}</span>
        </div>
        <div class="reco-score">
          <div class="score-bar"><span class="score-fill ${sc2}" style="width:${score}%"></span></div>
          <span class="score-num ${sc2}">${score}</span>
          <span class="reco-conf">信心 ${esc(r.confidence || '中')}</span>
        </div>
        <div class="reco-signals">
          ${signalTag('新闻面', r.newsSignal)}
          ${signalTag('行情面', r.quoteSignal)}
          ${r.divergence ? '<span class="sig sig-div">⚠ 背离</span>' : ''}
        </div>
        <div class="reco-quote">
          <span class="${signClass(chg)}">现价 ${price == null ? '—' : price}</span>
          <span class="${signClass(chg)}">${fmtPct(chg)}</span>
          <span class="${signClass(inflow)}">主力 ${fmtYi(inflow)}</span>
          ${turnover != null ? `<span>换手 ${turnover}%</span>` : ''}
        </div>
        <div class="reco-reason">${esc(r.reason || '')}</div>
      </div>`;
    })
    .join('');
}

async function loadRecommendations() {
  try {
    state.reco = await api('/api/recommendations');
  } catch (e) {
    state.reco = null;
  }
  renderRecoCombined();
}

async function loadLiveQuotes() {
  try {
    const d = await api('/api/quotes');
    state.liveQuotes = d;
    renderRecoCombined();
    const meta = document.getElementById('recoMeta');
    if (meta) {
      const prefix = state.lastRecoUpdate ? '推荐 ' + fmtTime(state.lastRecoUpdate) + ' · ' : '';
      meta.textContent = prefix + '行情 ' + fmtTime(d.fetchedAt);
    }
  } catch (e) {
    // 静默失败，下次轮询重试
  }
}

// ===== 加载 =====
async function loadConfig() {
  const c = await api('/api/config');
  if (!c || typeof c.hasKey !== 'boolean') throw new Error('后端不可用');
  state.aiEnabled = !!c.aiEnabled;
  state.hasKey = !!c.hasKey;
  document.getElementById('aiToggle').checked = state.aiEnabled;
  const meta = [];
  if (c.lastNewsUpdate) meta.push('新闻更新 ' + fmtTime(c.lastNewsUpdate));
  if (c.sources && c.sources.length) meta.push('来源：' + c.sources.join('、'));
  if (c.isFallback) meta.push('（当前为示例数据）');
  document.getElementById('newsMeta').textContent = meta.join(' · ');
  document.getElementById('aiMeta').textContent = c.lastAnalysisUpdate
    ? '分析更新 ' + fmtTime(c.lastAnalysisUpdate)
    : '';
  state.lastRecoUpdate = c.lastRecoUpdate || null;
  const rm = document.getElementById('recoMeta');
  if (rm) rm.textContent = c.lastRecoUpdate ? '推荐 ' + fmtTime(c.lastRecoUpdate) : '—';
  return c;
}

async function loadNews() {
  const d = await api('/api/news');
  state.sectors = d.sectors || [];
  state.news = d.items || [];
  state.page = 1;
  renderSectorTabs();
  renderNews();
}

async function loadAnalysis() {
  const a = await api('/api/analysis');
  state.analysis = a;
  renderAnalysis(a);
  renderEtf(a);
}

async function loadSnapshot() {
  const d = await api('/data-snapshot.json');
  if (!d || !d.news) throw new Error('未找到数据快照');
  state.sectors = d.news.sectors || [];
  state.news = d.news.items || [];
  state.page = 1;
  state.aiEnabled = false;
  state.staticMode = true;
  showSnapshotBanner();
  const toggle = document.getElementById('aiToggle');
  if (toggle) {
    toggle.checked = false;
    toggle.disabled = true;
  }
  const rb = document.getElementById('refreshBtn');
  if (rb) rb.style.display = 'none';
  renderSectorTabs();
  renderNews();
  renderAnalysis(d.analysis || { snapshotNote: true });
  renderEtf(d.analysis || { snapshotNote: true });
  const meta = [];
  if (d.news.fetchedAt) meta.push('快照新闻 · ' + fmtTime(d.news.fetchedAt));
  if (d.news.sources && d.news.sources.length) meta.push('来源：' + d.news.sources.join('、'));
  if (d.news.isFallback) meta.push('（示例数据）');
  document.getElementById('newsMeta').textContent = meta.join(' · ');
  document.getElementById('aiMeta').textContent = '（云端静态版）';
}

function showSnapshotBanner() {
  const el = document.createElement('div');
  el.className = 'snapshot-banner';
  el.innerHTML =
    '🌥️ 当前为 <b>云端静态快照</b>：展示最近一次抓取的真实财经新闻。实时自动更新与 AI 智能分析请在完整版（<code>node server.js</code>）运行。';
  const c = document.querySelector('.container');
  if (c) c.prepend(el);
}

function wireLiveControls() {
  document.getElementById('aiToggle').addEventListener('change', async (e) => {
    state.aiEnabled = e.target.checked;
    await api('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiEnabled: state.aiEnabled }),
    });
    renderAnalysis({});
    loadAnalysis();
    loadConfig();
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true;
    btn.textContent = '刷新中…';
    await api('/api/refresh', { method: 'POST' });
    await new Promise((r) => setTimeout(r, 1500));
    await Promise.all([loadConfig(), loadNews(), loadAnalysis(), loadRecommendations(), loadLiveQuotes(), loadEtfQuotes()]);
    btn.disabled = false;
    btn.textContent = '↻ 刷新';
  });
}

async function init() {
  try {
    await loadConfig();
    await Promise.all([loadNews(), loadAnalysis()]);
    wireLiveControls();
    await Promise.all([loadRecommendations(), loadLiveQuotes(), loadEtfQuotes()]);
    // 自动轮询：新闻/分析每日级，综合推荐行情与 ETF 行情每 30s 实时刷新
    setInterval(loadNews, 5 * 60 * 1000);
    setInterval(loadAnalysis, 15 * 60 * 1000);
    setInterval(loadLiveQuotes, 30 * 1000);
    setInterval(loadEtfQuotes, 30 * 1000);
  } catch (e) {
    // 后端不可用 -> 静态快照模式（云端纯静态部署）
    try {
      await loadSnapshot();
    } catch (err) {
      document.getElementById('newsList').innerHTML =
        '<div class="placeholder">加载失败：' + esc(err && err.message ? err.message : err) + '</div>';
    }
  }
}

init();
