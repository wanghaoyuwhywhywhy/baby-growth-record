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
    value: { id: string; type: 'image' | 'video'; blob: Blob; recordId: string; createdAt: string };
    indexes: { 'by-record': string };
  };
}

const DB_NAME = 'baby-growth-record';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BabyGrowthDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BabyGrowthDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
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

export async function dbAddGrowthRecord(record: GrowthRecord): Promise<void> {
  const db = await getDB();
  await db.put('growth', record);
}

export async function dbDeleteGrowthRecord(record_id: string): Promise<void> {
  const db = await getDB();
  await db.delete('growth', record_id);
}

// Media CRUD
export async function dbAddMedia(id: string, type: 'image' | 'video', blob: Blob, recordId: string): Promise<void> {
  const db = await getDB();
  await db.put('media', { id, type, blob, recordId, createdAt: new Date().toISOString() });
}

export async function dbGetMediaByRecord(recordId: string): Promise<{ id: string; type: 'image' | 'video'; blob: Blob; recordId: string; createdAt: string }[]> {
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
  const tx = db.transaction(['babies', 'records', 'growth', 'media'], 'readwrite');
  await Promise.all([
    tx.objectStore('babies').clear(),
    tx.objectStore('records').clear(),
    tx.objectStore('growth').clear(),
    tx.objectStore('media').clear(),
    tx.done,
  ]);
}
