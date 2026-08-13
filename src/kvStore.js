// KV 存储实现（Cloudflare Workers 用）。由 worker.js 通过 createKvStore(env.NEWS_KV) 创建，
// 不引用任何 node: 内置模块，确保 Worker 构建干净。
export function createKvStore(kv) {
  return {
    async readJson(name, fallback) {
      try {
        const v = await kv.get(name);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    async writeJson(name, data) {
      await kv.put(name, JSON.stringify(data));
    },
  };
}
