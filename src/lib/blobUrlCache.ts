/**
 * 全局 Blob URL 缓存：跨页面/跨组件复用，避免切换页面时重复加载媒体。
 *
 * 核心问题：原来组件卸载就 URL.revokeObjectURL，导致切换页面再切回来
 * 必须重新从 IndexedDB 读 Blob + 重建 objectURL + 图片/视频重新解码，"一直等"。
 *
 * 方案：按 file_token（飞书附件不可变）做 key，引用计数管理生命周期：
 *   - acquire(token, blob)：命中则 refCount++ 返回已有 url；否则创建并存入
 *   - release(token)：refCount--，归零后不立即 revoke，留给页面切换复用
 *   - LRU：超出上限时清理 refCount=0 且最久未用的条目
 *
 * 时序示例（首页 ↔ 时间线页同一批记录）：
 *   1. 首页 RecordItem acquire(tokenA)  → refCount=1，创建 url
 *   2. 切到时间线页，RecordItem 卸载 release(tokenA) → refCount=0（不 revoke）
 *   3. 时间线页 MediaPreview acquire(tokenA) → refCount=1，复用 url，秒开
 *   4. 返回首页，MediaPreview release(tokenA) → refCount=0
 *   5. 首页 RecordItem acquire(tokenA) → 复用 url，秒开
 */

interface CacheEntry {
  url: string;
  refCount: number;
  lastUsed: number;
  size: number; // blob 字节数，用于 LRU 按总大小清理
}

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 300;
const MAX_TOTAL_BYTES = 600 * 1024 * 1024; // 600MB 上限（与 IndexedDB mediaCache 的 500MB 对齐略宽）

let totalBytes = 0;

/**
 * 获取（或复用）一个 blob URL。同一 file_token 多次 acquire 只会创建一个 objectURL。
 * 调用方在组件卸载时必须配对调用 release(token)。
 */
export function acquireBlobUrl(fileToken: string, blob: Blob): string {
  const existing = cache.get(fileToken);
  if (existing) {
    existing.refCount += 1;
    existing.lastUsed = Date.now();
    return existing.url;
  }

  const url = URL.createObjectURL(blob);
  const size = blob.size || 0;
  cache.set(fileToken, { url, refCount: 1, lastUsed: Date.now(), size });
  totalBytes += size;

  // LRU 清理：超上限时淘汰 refCount=0 且最久未用的条目
  pruneIfNeed();

  return url;
}

/**
 * 释放对一个 blob URL 的引用。refCount 归零后不立即 revoke，
 * 留给页面切换复用；最终由 LRU 在 acquire 时或定期清理时回收。
 */
export function releaseBlobUrl(fileToken: string): void {
  const entry = cache.get(fileToken);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  // 不立即 revoke，交给 LRU/定期清理
}

/**
 * 判断该 token 的 blob URL 是否已在缓存中（用于"已加载过则直接复用"的快速判断）。
 */
export function hasBlobUrl(fileToken: string): boolean {
  return cache.has(fileToken);
}

/**
 * 主动清理所有 refCount=0 的条目（例如设置页"清空缓存"时调用）。
 */
export function clearIdleBlobUrls(): void {
  for (const [key, entry] of cache) {
    if (entry.refCount <= 0) {
      URL.revokeObjectURL(entry.url);
      totalBytes -= entry.size;
      cache.delete(key);
    }
  }
}

function pruneIfNeed(): void {
  if (cache.size <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) return;

  // 收集 refCount=0 的条目，按 lastUsed 升序淘汰
  const idle: { key: string; lastUsed: number; size: number }[] = [];
  for (const [key, entry] of cache) {
    if (entry.refCount <= 0) idle.push({ key, lastUsed: entry.lastUsed, size: entry.size });
  }
  idle.sort((a, b) => a.lastUsed - b.lastUsed);

  for (const { key, size } of idle) {
    if (cache.size <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) break;
    const entry = cache.get(key);
    if (!entry) continue;
    URL.revokeObjectURL(entry.url);
    totalBytes -= size;
    cache.delete(key);
  }
}
