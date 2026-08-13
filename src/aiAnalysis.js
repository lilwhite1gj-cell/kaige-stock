import { config } from './config.js';

// 调用 DeepSeek 生成个股分级 + ETF板块建议
// apiKey 优先使用显式传入（便于 Cloudflare 通过 env 注入），回退到本地 .env
export async function generateAnalysis(news, apiKey) {
  const key = apiKey || config.deepseek.apiKey;
  if (!key) {
    return { ok: false, reason: 'NO_KEY' };
  }

  const sample = (news || [])
    .slice(0, 45)
    .map((n) => `- [${n.sectorName || '其他'}] ${n.title}`)
    .join('\n');

  const sys = '你是资深财经分析师，必须只输出严格合法的 JSON，不要任何额外解释文字。';
  const user = `基于以下最新财经新闻，输出 JSON：
{
  "summary": "今日市场综述（2-3句话）",
  "stocks": [
    {"name":"股票名称或代码","sector":"所属板块","grade":"推荐投资个股|少量持有个股|高风险个股","reason":"一句话理由"}
  ],
  "etfs": [
    {"sector":"板块","name":"ETF名称","code":"ETF代码如510500","action":"买入|持有|回避","reason":"一句话理由"}
  ]
}
规则：
1. 个股仅基于新闻中明确提及的标的，最多8只；若无明确标的 stocks 可为空数组。
2. grade 只能取：推荐投资个股 / 少量持有个股 / 高风险个股。
3. 给出 3-6 个 ETF 板块建议，action 只能取：买入 / 持有 / 回避。
4. 所有内容必须客观、带风险提示，不承诺收益。
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
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return { ok: false, reason: 'EMPTY' };
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = { raw: content };
    }
    return { ok: true, data: parsed, generatedAt: new Date().toISOString() };
  } catch (e) {
    return { ok: false, reason: 'EXCEPTION', detail: String(e && e.message ? e.message : e) };
  }
}
