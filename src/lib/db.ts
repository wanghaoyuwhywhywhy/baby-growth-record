import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Baby, DailyRecord, GrowthRecord } from '@/api/feishu';

interface BabyGrowthDB extends DBSchema {
  babies: {
    key: string;
    value: Baby;
  };
  records: {
    key: string;
    value: DailyRecord;
    indexes: { 'by-baby': string };
  };
  growth: {
    key: string;
    value: GrowthRecord;
    indexes: { 'by-baby': string };
  };
  media: {
    key: string;
    value: { id: string; type: 'image' | 'video' | 'voice'; blob: Blob; recordId: string; createdAt: string };
    indexes: { 'by-record': string };
  };
  // 云端媒体 Blob 缓存：key = file_token，value = { blob, etag, contentType, size, lastUsedAt }
  // 飞书 file_token 内容不可变，缓存长期有效；通过 LRU 限制总大小
  mediaCache: {
    key: string; // file_token
    value: {
      fileToken: string;
      blob: Blob;
      etag: string;
      contentType: string;
      size: number; // bytes
      lastUsedAt: number; // Date.now()
      createdAt: number;
    };
    indexes: { 'by-lastUsed': number };
  };
}

const DB_NAME = 'baby-growth-record';
const DB_VERSION = 2; // bump: 新增 mediaCache store

// 媒体缓存容量上限（防止 IndexedDB 无限增长）
// 图片/视频容易占空间，这里设置保守值；可在设置页做清理入口
export const MEDIA_CACHE_MAX_ITEMS = 500;      // 最多缓存 500 个文件
export const MEDIA_CACHE_MAX_BYTES = 500 * 1024 * 1024; // 最多 500MB

let dbPromise: Promise<IDBPDatabase<BabyGrowthDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BabyGrowthDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('babies')) {
          db.createObjectStore('babies', { keyPath: 'record_id' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'record_id' });
          store.createIndex('by-baby', '关联宝宝');
        }
        if (!db.objectStoreNames.contains('growth')) {
          const store = db.createObjectStore('growth', { keyPath: 'record_id' });
          store.createIndex('by-baby', '关联宝宝');
        }
        if (!db.objectStoreNames.contains('media')) {
          const store = db.createObjectStore('media', { keyPath: 'id' });
          store.createIndex('by-record', 'recordId');
        }
        // v1 -> v2: 新增 mediaCache
        if (!db.objectStoreNames.contains('mediaCache')) {
          const store = db.createObjectStore('mediaCache', { keyPath: 'fileToken' });
          store.createIndex('by-lastUsed', 'lastUsedAt');
        }
      },
    });
  }
  return dbPromise;
}

// Baby CRUD
export async function dbGetBabies(): Promise<Baby[]> {
  const db = await getDB();
  return db.getAll('babies');
}

export async function dbAddBaby(baby: Baby): Promise<void> {
  const db = await getDB();
  await db.put('babies', baby);
}

export async function dbUpdateBaby(baby: Baby): Promise<void> {
  const db = await getDB();
  await db.put('babies', baby);
}

export async function dbDeleteBaby(record_id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['babies', 'records', 'growth', 'media'], 'readwrite');
  await tx.objectStore('babies').delete(record_id);
  // 删除关联的记录（关联宝宝是数组字段，不能用 index，改为 getAll + filter）
  const allRecords = await tx.objectStore('records').getAll();
  for (const r of allRecords) {
    if (r.关联宝宝?.includes(record_id)) {
      await tx.objectStore('records').delete(r.record_id);
    }
  }
  // 删除关联的成长记录
  const allGrowth = await tx.objectStore('growth').getAll();
  for (const g of allGrowth) {
    if (g.关联宝宝?.includes(record_id)) {
      await tx.objectStore('growth').delete(g.record_id);
    }
  }
  await tx.done;
}

// Record CRUD
export async function dbGetRecords(babyId?: string): Promise<DailyRecord[]> {
  const db = await getDB();
  let records: DailyRecord[];
  if (babyId) {
    // 关联宝宝是数组，不能用 index 直接查，改为 getAll 后过滤
    const all = await db.getAll('records');
    records = all.filter((r) => r.关联宝宝?.includes(babyId));
  } else {
    records = await db.getAll('records');
  }
  records.sort((a, b) => new Date(b.记录时间).getTime() - new Date(a.记录时间).getTime());
  return records;
}

export async function dbAddRecord(record: DailyRecord): Promise<void> {
  const db = await getDB();
  await db.put('records', record);
}

// 删除单条记录并清理其关联的本地媒体（孤儿清理用）
export async function dbDeleteRecord(record_id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['records', 'media'], 'readwrite');
  await tx.objectStore('records').delete(record_id);
  const medias = await tx.objectStore('media').index('by-record').getAll(record_id);
  for (const m of medias) {
    await tx.objectStore('media').delete(m.id);
  }
  await tx.done;
}

export async function dbUpdateRecordMedia(recordId: string, mediaTokens: string[]): Promise<void> {
  const db = await getDB();
  const record = await db.get('records', recordId);
  if (record) {
    record.媒体附件 = mediaTokens;
    await db.put('records', record);
  }
}

// Growth CRUD
export async function dbGetGrowthRecords(babyId: string): Promise<GrowthRecord[]> {
  const db = await getDB();
  const all = await db.getAll('growth');
  const records = all.filter((r) => r.关联宝宝?.includes(babyId));
  records.sort((a, b) => new Date(a.测量日期).getTime() - new Date(b.测量日期).getTime());
  return records;
}

// 获取全部成长记录（孤儿清理用，不按宝宝过滤）
export async function dbGetAllGrowth(): Promise<GrowthRecord[]> {
  const db = await getDB();
  return db.getAll('growth');
}

export async function dbAddGrowthRecord(record: GrowthRecord): Promise<void> {
  const db = await getDB();
  await db.put('growth', record);
}

export async function dbDeleteGrowthRecord(record_id: string): Promise<void> {
  const db = await getDB();
  await db.delete('growth', record_id);
}

// Media CRUD
export async function dbAddMedia(id: string, type: 'image' | 'video' | 'voice', blob: Blob, recordId: string): Promise<void> {
  const db = await getDB();
  await db.put('media', { id, type, blob, recordId, createdAt: new Date().toISOString() });
}

export async function dbGetMediaByRecord(recordId: string): Promise<{ id: string; type: 'image' | 'video' | 'voice'; blob: Blob; recordId: string; createdAt: string }[]> {
  const db = await getDB();
  return db.getAllFromIndex('media', 'by-record', recordId);
}

export async function dbDeleteMedia(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('media', id);
}

// 清空所有数据（同步时先清空再写入云端数据）
export async function dbClearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['babies', 'records', 'growth', 'media', 'mediaCache'], 'readwrite');
  await Promise.all([
    tx.objectStore('babies').clear(),
    tx.objectStore('records').clear(),
    tx.objectStore('growth').clear(),
    tx.objectStore('media').clear(),
    tx.objectStore('mediaCache').clear(),
    tx.done,
  ]);
}

// ======================== 云端媒体 Blob 缓存（mediaCache store） ========================

export type MediaCacheEntry = {
  fileToken: string;
  blob: Blob;
  etag: string;
  contentType: string;
  size: number;
  lastUsedAt: number;
  createdAt: number;
};

/** 读取缓存，命中时自动刷新 lastUsedAt（LRU 热度） */
export async function dbGetMediaCache(fileToken: string): Promise<MediaCacheEntry | null> {
  if (!fileToken) return null;
  const db = await getDB();
  const entry = await db.get('mediaCache', fileToken);
  if (!entry) return null;
  // 命中即更新 lastUsedAt，保持热度
  const touched: MediaCacheEntry = { ...entry, lastUsedAt: Date.now() };
  await db.put('mediaCache', touched);
  return touched;
}

/** 写入缓存，并在超出上限时触发 LRU 清理 */
export async function dbPutMediaCache(entry: MediaCacheEntry): Promise<void> {
  const db = await getDB();
  await db.put('mediaCache', entry);
  // 异步 LRU 清理：不阻塞本次写入
  setTimeout(() => { dbPruneMediaCache().catch(() => {}); }, 0);
}

/** 手动清空媒体缓存（设置页按钮调用） */
export async function dbClearMediaCache(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('mediaCache', 'readwrite');
  await tx.objectStore('mediaCache').clear();
  await tx.done;
}

/** 查询媒体缓存当前状态（用于设置页展示） */
export async function dbGetMediaCacheStats(): Promise<{ items: number; bytes: number }> {
  const db = await getDB();
  const all = await db.getAll('mediaCache');
  let bytes = 0;
  for (const e of all) bytes += e.size || 0;
  return { items: all.length, bytes };
}

/**
 * LRU 清理：当条目数或总字节超出上限时，
 * 按 lastUsedAt 升序删除最久未用的，直到回到阈值以下。
 */
export async function dbPruneMediaCache(): Promise<{ deleted: number; freedBytes: number }> {
  const db = await getDB();
  // 用 by-lastUsed 索引，从小到大（最久未用在前）
  const all = await db.getAllFromIndex('mediaCache', 'by-lastUsed');
  if (all.length === 0) return { deleted: 0, freedBytes: 0 };

  let totalBytes = 0;
  for (const e of all) totalBytes += e.size || 0;

  if (all.length <= MEDIA_CACHE_MAX_ITEMS && totalBytes <= MEDIA_CACHE_MAX_BYTES) {
    return { deleted: 0, freedBytes: 0 };
  }

  // 需要删除最旧的 N 个：目标是让两个指标都回到阈值内，且至少删到阈值 90%（避免抖动）
  const targetItems = Math.floor(MEDIA_CACHE_MAX_ITEMS * 0.9);
  const targetBytes = Math.floor(MEDIA_CACHE_MAX_BYTES * 0.9);
  const needDelete = Math.max(0, all.length - targetItems);
  // 先按条目数取最小删除数，再按字节数往后延伸
  let deleteCount = needDelete;
  let sumAfterDelete = totalBytes;
  for (let i = 0; i < deleteCount; i++) sumAfterDelete -= all[i].size || 0;
  while (deleteCount < all.length && sumAfterDelete > targetBytes) {
    sumAfterDelete -= all[deleteCount].size || 0;
    deleteCount++;
  }
  if (deleteCount === 0) return { deleted: 0, freedBytes: 0 };

  const tx = db.transaction('mediaCache', 'readwrite');
  let freed = 0;
  for (let i = 0; i < deleteCount; i++) {
    const key = all[i].fileToken;
    freed += all[i].size || 0;
    tx.objectStore('mediaCache').delete(key);
  }
  await tx.done;
  console.info(`[mediaCache] LRU prune: deleted ${deleteCount} items, freed ${(freed / 1024 / 1024).toFixed(1)}MB`);
  return { deleted: deleteCount, freedBytes: freed };
}
