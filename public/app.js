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
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

  const etfs = (a.etfs || [])
    .map(
      (e) => `<div class="etf-card">
        <div class="etf-top">
          <span class="etf-name">${esc(e.name || 'ETF')}</span>
          ${actionBadge(e.action)}
        </div>
        <div class="etf-code">${esc(e.code || '')}</div>
        <div class="etf-sector">板块：${esc(e.sector || '')}</div>
        <div class="etf-reason">${esc(e.reason || '')}</div>
      </div>`
    )
    .join('');

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
    <h3 style="margin:6px 0 10px;font-size:15px;">每日 ETF 板块建议</h3>
    <div class="etf-grid">${etfs || '<div class="placeholder">暂无 ETF 建议</div>'}</div>
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
    await Promise.all([loadConfig(), loadNews(), loadAnalysis()]);
    btn.disabled = false;
    btn.textContent = '↻ 刷新';
  });
}

async function init() {
  try {
    await loadConfig();
    await Promise.all([loadNews(), loadAnalysis()]);
    wireLiveControls();
    // 自动轮询，保持与每日更新同步
    setInterval(loadNews, 5 * 60 * 1000);
    setInterval(loadAnalysis, 15 * 60 * 1000);
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
