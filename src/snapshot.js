'use strict';

// 生成静态快照：供 CloudStudio 等纯静态云端部署展示真实新闻内容
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');
const fetchNews = require('./fetchNews');
const { allSectors } = require('./categorize');

async function build() {
  let news = store.readJson('news.json', null);
  if (!news || !news.items || !news.items.length) {
    const r = await fetchNews.fetchAll();
    news = { items: r.items, fetchedAt: r.fetchedAt, isFallback: r.isFallback, sources: r.sources };
    store.writeJson('news.json', news);
  }
  const analysis = store.readJson('analysis.json', { enabled: false, snapshotNote: true });

  const snapshot = {
    isSnapshot: true,
    generatedAt: new Date().toISOString(),
    news: Object.assign({ sectors: allSectors() }, news),
    analysis,
  };

  const outDir = config.publicDir;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'data-snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot), 'utf8');
  console.log('快照已生成:', outPath, '| 新闻条数:', news.items.length, '| 来源:', (news.sources || []).join('/'));
}

build().catch((e) => {
  console.error('快照生成失败:', e);
  process.exit(1);
});
