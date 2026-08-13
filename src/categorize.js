// 股票板块定义（用于新闻分类与AI分析对齐）
export const SECTORS = [
  {
    key: 'tech',
    name: '科技',
    keywords: ['科技', '芯片', '半导体', '人工智能', 'ai', '软件', '互联网', '5g', '通信', '电子', '华为', '算力', '量子', '机器人', '自动驾驶', '数据', '云计算'],
  },
  {
    key: 'finance',
    name: '金融',
    keywords: ['银行', '券商', '证券', '保险', '金融', '信托', '基金', '信贷', '利率', '货币', '央行', '降准', '降息', '贷款', '理财', 'a股', '股市', '大盘'],
  },
  {
    key: 'consumer',
    name: '消费',
    keywords: ['消费', '白酒', '食品', '饮料', '零售', '电商', '家电', '汽车', '旅游', '餐饮', '服装', '乳业', '免税', '商场'],
  },
  {
    key: 'medical',
    name: '医药',
    keywords: ['医药', '医疗', '生物', '制药', '疫苗', '创新药', '医疗器械', '健康', '中药', 'cxo', '医美', '医保'],
  },
  {
    key: 'energy',
    name: '新能源',
    keywords: ['新能源', '光伏', '锂电', '储能', '电动车', '氢能', '风电', '碳中和', '电池', '充电桩', '新能车'],
  },
  {
    key: 'realestate',
    name: '地产',
    keywords: ['房地产', '地产', '楼市', '房贷', '物业', '建材', '基建', '水泥', '钢铁', '建筑'],
  },
  {
    key: 'military',
    name: '军工',
    keywords: ['军工', '国防', '航空', '航天', '船舶', '兵器', '卫星', '装备'],
  },
];

export const OTHER = { key: 'other', name: '其他', keywords: [] };

export function categorize(text) {
  const t = (text || '').toLowerCase();
  for (const s of SECTORS) {
    if (s.keywords.some((k) => t.includes(k.toLowerCase()))) {
      return { key: s.key, name: s.name };
    }
  }
  return { key: OTHER.key, name: OTHER.name };
}

export function allSectors() {
  return [...SECTORS, OTHER];
}
