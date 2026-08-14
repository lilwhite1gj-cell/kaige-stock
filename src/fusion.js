// 综合推荐融合引擎：新闻基本面信号 × 行情量价/资金信号 → 加权融合
// 输入：news(新闻列表) + analysis(新闻分级) + quotes(实时行情+资金流+大盘)
// 输出：大盘研判 + 每只标的的操作建议(买入/持有/卖出)、综合评分、信心度、新闻面/行情面信号、是否背离、研判依据
import { config } from './config.js';

function yi(v) {
  // 元 -> 亿元（保留 2 位）
  if (v == null) return null;
  return Math.round((v / 1e8) * 100) / 100;
}

function summarizeQuote(q) {
  if (!q) return '（暂无行情数据）';
  const parts = [];
  parts.push(`最新价 ${q.price}`);
  if (q.changePct != null) parts.push(`涨跌幅 ${q.changePct}%`);
  if (q.turnover != null) parts.push(`换手率 ${q.turnover}%`);
  if (q.pe != null) parts.push(`市盈率 ${q.pe}`);
  if (q.pb != null) parts.push(`市净率 ${q.pb}`);
  if (q.mainNetInflow != null) {
    const m = yi(q.mainNetInflow);
    parts.push(`主力净流入 ${m}亿`);
  }
  if (q.amount != null) parts.push(`成交额 ${yi(q.amount)}亿`);
  return parts.join('，');
}

// 组装候选标的：新闻衍生(analysis.stocks) ∪ 自选兜底(config.watchlist)
function buildCandidates(analysis, quotes) {
  const byName = new Map();
  (quotes.stocks || []).forEach((q) => byName.set((q.name || '').trim(), q));

  const cand = [];
  const seen = new Set();

  // 1) 新闻衍生（带板块/评级上下文）
  (analysis.stocks || []).forEach((s) => {
    const key = (s.name || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    cand.push({
      name: s.name,
      market: s.market || 'A股',
      sector: s.sector || '',
      grade: s.grade || '',
      recommendIndex: s.recommendIndex,
      quote: byName.get(key) || null,
      fromNews: true,
    });
  });

  // 2) 自选兜底（新闻无明确标的时保证有数据）
  config.quotes.watchlist.forEach((w) => {
    const key = (w.name || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    cand.push({
      name: w.name,
      market: quotes.stocks.find((q) => q.name === w.name)?.market || 'A股',
      sector: '',
      grade: '',
      recommendIndex: null,
      quote: byName.get(key) || null,
      fromNews: false,
    });
  });

  return cand.slice(0, config.recommendations.maxCandidates);
}

// 关联新闻：标题含股票名，或板块匹配
function relatedNews(cand, news) {
  const out = [];
  (news || [])
    .filter((n) => {
      const t = (n.title || '').toLowerCase();
      if (t.includes((cand.name || '').toLowerCase())) return true;
      if (cand.sector && n.sectorName === cand.sector) return true;
      return false;
    })
    .slice(0, 6)
    .forEach((n) => out.push(`[${n.sectorName || '其他'}] ${n.title}`));
  return out;
}

export async function generateRecommendations({ news, analysis, quotes }, apiKey) {
  const key = apiKey || config.deepseek.apiKey;
  if (!key) return { ok: false, reason: 'NO_KEY' };

  const candidates = buildCandidates(analysis || {}, quotes || { stocks: [] });
  if (!candidates.length) return { ok: false, reason: 'NO_CANDIDATES' };

  // 大盘研判上下文
  const idxLines = (quotes.indices || []).map(
    (i) => `${i.name} ${i.changePct != null ? i.changePct + '%' : '—'}`,
  );
  const marketCtx = idxLines.length ? idxLines.join('；') : '（无大盘数据）';

  const blocks = candidates
    .map((c, i) => {
      const rn = relatedNews(c, news);
      const newsCtx = rn.length
        ? rn.join('\n')
        : c.fromNews
          ? '（新闻分级中提及，但无直接关联新闻正文）'
          : '（自选兜底标的，无直接新闻信号）';
      return `【${i + 1}】${c.name}（${c.market}）
新闻面：${newsCtx}
行情面：${summarizeQuote(c.quote)}${c.grade ? `\n新闻分级评级：${c.grade}（指数${c.recommendIndex ?? '—'}）` : ''}`;
    })
    .join('\n\n');

  const sys =
    '你是资深量化+基本面融合分析师，必须只输出严格合法的 JSON，不要任何额外解释文字。需将新闻基本面信号与行情量价/资金信号交叉验证。';
  const user = `基于以下「大盘环境 + 个股新闻面与行情面」数据，输出 JSON：

{
  "market": { "sentiment": "偏多|中性|偏空", "note": "一句话大盘研判（结合指数涨跌与资金风格）" },
  "recommendations": [
    {
      "name": "股票名称",
      "action": "买入|持有|卖出",
      "score": 1-100,
      "confidence": "高|中|低",
      "newsSignal": "正面|中性|负面",
      "quoteSignal": "强势|中性|弱势",
      "divergence": false,
      "reason": "研判依据：须同时引用新闻信号与量价/资金信号，并说明二者是否共振或背离"
    }
  ]
}

规则：
1. action 只能是 买入 / 持有 / 卖出。
2. score 1-100：买入给 70-100，持有 40-69，卖出 1-39；与 action 自洽。
3. divergence 表示新闻面与行情面是否背离（如新闻利好但主力大幅净流出/价格下跌），背离时 action 应更保守、confidence 降低。
4. 加权原则：新闻定方向，行情定量级与时机；两面共振则 confidence=高、score 偏高。
5. 所有结论须客观、附风险提示，不承诺收益。
6. recommendations 数量与输入标的逐一对应，name 必须与输入一致。

大盘环境：${marketCtx}

标的清单（新闻面 + 行情面）：
${blocks}`;

  try {
    const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, reason: 'API_ERROR', status: res.status, detail: txt.slice(0, 300) };
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return { ok: false, reason: 'EMPTY' };
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = { raw: content };
    }
    if (!parsed || !parsed.recommendations) return { ok: false, reason: 'BAD_SHAPE', detail: String(content).slice(0, 300) };

    // 将行情快照回灌进每条推荐，便于前端直接展示（即时价格仍由 /api/quotes 实时叠加）
    const quoteByName = new Map((quotes.stocks || []).map((q) => [(q.name || '').trim(), q]));
    parsed.recommendations = parsed.recommendations.map((r) => {
      const q = quoteByName.get((r.name || '').trim());
      return Object.assign({}, r, {
        market: r.market || (q ? q.market : 'A股'),
        code: q ? q.code : '',
        secid: q ? q.secid : '',
        price: q ? q.price : null,
        changePct: q ? q.changePct : null,
        mainNetInflow: q ? yi(q.mainNetInflow) : null,
        turnover: q ? q.turnover : null,
      });
    });

    return { ok: true, data: parsed, generatedAt: new Date().toISOString() };
  } catch (e) {
    return { ok: false, reason: 'EXCEPTION', detail: String(e && e.message ? e.message : e) };
  }
}
