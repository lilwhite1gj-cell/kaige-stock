import { config } from './config.js';

// 调用 DeepSeek 生成个股分级 + ETF 板块推荐
// apiKey 优先使用显式传入（便于 Cloudflare 通过 env 注入），回退到本地 .env
// etfQuotes：fetchEtfs() 返回的实时行情，用于让 ETF 推荐落地到真实量价信号
export async function generateAnalysis(news, apiKey, etfQuotes) {
  const key = apiKey || config.deepseek.apiKey;
  if (!key) {
    return { ok: false, reason: 'NO_KEY' };
  }

  const sample = (news || [])
    .slice(0, 45)
    .map((n) => `- [${n.sectorName || '其他'}] ${n.title}`)
    .join('\n');

  // ETF 实时行情上下文（按 国内 / 纳斯达克相关 分组）
  let etfCtx = '（无行情数据）';
  const flat = [];
  if (etfQuotes) {
    for (const grp of [etfQuotes.domestic || [], etfQuotes.nasdaq || []]) {
      for (const e of grp) flat.push(e);
    }
  }
  if (flat.length) {
    const byCat = { 国内: [], 纳斯达克相关: [] };
    flat.forEach((e) => {
      (byCat[e.category] || byCat['国内']).push(e);
    });
    etfCtx = Object.entries(byCat)
      .map(([cat, list]) => {
        const lines = list
          .map(
            (e) =>
              `  - ${e.name}(${e.code}) 板块:${e.sector} 现价:${e.price ?? '—'} 涨跌幅:${
                e.changePct ?? '—'
              }%`,
          )
          .join('\n');
        return `【${cat}】\n${lines}`;
      })
      .join('\n');
  }

  const sys = '你是资深财经分析师，必须只输出严格合法的 JSON，不要任何额外解释文字。';
  const user = `基于以下财经新闻（政策动向/市场情绪/重大事件）与 ETF 实时行情，输出 JSON：
{
  "summary": "今日市场综述（2-3句话）",
  "stocks": [
    {"name":"股票名称或代码","sector":"所属板块","market":"A股|港股|美股|其他","grade":"推荐投资个股|少量持有个股|高风险个股","recommendIndex":80,"reason":"一句话理由"}
  ],
  "etfs": [
    {"name":"ETF名称","code":"ETF代码","action":"买入|持有|回避|定投","logic":"该ETF的推荐逻辑（2-3句，结合新闻面与量价面）"}
  ]
}
规则：
1. 个股仅基于新闻中明确提及的标的，最多8只；若无明确标的 stocks 可为空数组。
2. grade 只能取：推荐投资个股 / 少量持有个股 / 高风险个股。
3. market 只能取：A股 / 港股 / 美股 / 其他（按上市地判断，如无法判断填其他）。
4. recommendIndex 为 1-100 的整数：推荐投资个股给 70-100，少量持有给 40-69，高风险给 1-39。
5. etfs 必须覆盖以下全部 ETF（名称/代码以行情列表为准），逐只给出 action 与 logic：
${etfCtx}
6. action 只能取：买入 / 持有 / 回避 / 定投（定投用于长期看好但短期波动大的品种）。
7. 所有内容必须客观、带风险提示，不承诺收益。
新闻列表：
${sample}`;

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
        temperature: 0.35,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, reason: 'API_ERROR', status: res.status, detail: txt.slice(0, 300) };
    }
    const data = await res.json();
    const content =
      data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return { ok: false, reason: 'EMPTY' };
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = { raw: content };
    }
    if (!parsed || parsed.raw) {
      return { ok: false, reason: 'PARSE_FAIL', detail: (parsed && parsed.raw) || '' };
    }

    // 用真实行情合并 ETF 推荐：保证全部精选 ETF 都有实时价 + AI 研判
    parsed.etfs = buildEtfs(parsed.etfs || [], etfQuotes);
    return { ok: true, data: parsed, generatedAt: new Date().toISOString() };
  } catch (e) {
    return { ok: false, reason: 'EXCEPTION', detail: String(e && e.message ? e.message : e) };
  }
}

// 把 AI 的 ETF 研判（action/logic）对齐到精选池，并叠加真实行情价
function buildEtfs(aiEtfs, etfQuotes) {
  const aiByCode = new Map(
    (aiEtfs || [])
      .filter((x) => x && x.code)
      .map((x) => [String(x.code).toUpperCase(), x]),
  );
  const flatAll = etfQuotes
    ? [...(etfQuotes.domestic || []), ...(etfQuotes.nasdaq || [])]
    : [];

  if (flatAll.length) {
    return flatAll.map((e) => {
      const a = aiByCode.get(String(e.code).toUpperCase()) || {};
      return {
        category: e.category,
        sector: e.sector,
        name: e.name,
        code: e.code,
        price: e.price,
        changePct: e.changePct,
        hasQuote: !!e.hasQuote,
        action: a.action || '持有',
        logic: a.logic || a.reason || '暂无 AI 研判，请结合实时行情自行判断。',
      };
    });
  }
  // 无行情兜底：直接展示 AI 给出的 ETF
  return (aiEtfs || []).map((a) => ({
    category: a.category || null,
    sector: a.sector || null,
    name: a.name,
    code: a.code,
    price: null,
    changePct: null,
    hasQuote: false,
    action: a.action || '持有',
    logic: a.logic || a.reason || '',
  }));
}
