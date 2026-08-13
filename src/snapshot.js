// 生成静态快照：供 CloudStudio / Cloudflare Pages 等纯静态托管展示真实新闻内容
import { scheduler } from './scheduler.js';
import { fileStore } from './fileStore.js';
import { allSectors } from './categorize.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  scheduler.setStore(fileStore);
  let news = await scheduler.getNews();
  if (!news || !news.items || !news.items.length) {
    await scheduler.refreshNews();
    news = await scheduler.getNews();
  }
  const analysis = await scheduler.getAnalysis();

  const snapshot = {
    isSnapshot: true,
    generatedAt: new Date().toISOString(),
    news: Object.assign({ sectors: allSectors() }, news),
    analysis,
  };

  const outDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'data-snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot), 'utf8');
  console.log('快照已生成:', outPath, '| 新闻条数:', news.items.length, '| 来源:', (news.sources || []).join('/'));
}

main().catch((e) => {
  console.error('快照生成失败:', e);
  process.exit(1);
});
