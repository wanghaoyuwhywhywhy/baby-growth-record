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

// 初始化演示数据（仅首次）
export async function seedIfEmpty() {
  const db = await getDB();
  const babyCount = await db.count('babies');
  if (babyCount > 0) return;

  const demoBabies: Baby[] = [
    {
      record_id: 'recvmSNnuni5bU',
      宝宝姓名: '小宝',
      出生日期: '2025-06-15',
      性别: '男',
      妈妈名字: '妈妈',
      爸爸名字: '爸爸',
      备注: '一个可爱的小宝贝',
    },
  ];
  const demoRecords: DailyRecord[] = [
    { record_id: 'rec001', 记录内容: '今天第一次清楚地叫了"妈妈"，太感动了！', 分类: '语言', 记录时间: new Date(Date.now() - 3600000).toISOString(), 是否为里程碑: true, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'rec002', 记录内容: '午饭吃了半碗米糊加胡萝卜泥，胃口不错', 分类: '饮食', 记录时间: new Date(Date.now() - 5 * 3600000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'rec003', 记录内容: '上午睡了2小时，下午睡了1.5小时', 分类: '睡眠', 记录时间: new Date(Date.now() - 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'rec004', 记录内容: '扶着沙发走了三小步！虽然摇摇晃晃的', 分类: '运动', 记录时间: new Date(Date.now() - 2 * 86400000).toISOString(), 是否为里程碑: true, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'rec005', 记录内容: '今天打了疫苗，哭了两声就停了，很勇敢', 分类: '健康', 记录时间: new Date(Date.now() - 3 * 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
  ];
  const demoGrowth: GrowthRecord[] = [
    { record_id: 'g001', 测量日期: '2025-06-15', 身高: 50, 体重: 3.3, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g002', 测量日期: '2025-07-15', 身高: 54, 体重: 4.5, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g003', 测量日期: '2025-08-15', 身高: 57, 体重: 5.6, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g004', 测量日期: '2025-09-15', 身高: 60, 体重: 6.4, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g005', 测量日期: '2025-10-15', 身高: 62, 体重: 7.0, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g006', 测量日期: '2025-11-15', 身高: 64, 体重: 7.5, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g007', 测量日期: '2025-12-15', 身高: 66, 体重: 8.0, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g008', 测量日期: '2026-01-15', 身高: 68, 体重: 8.5, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g009', 测量日期: '2026-02-15', 身高: 70, 体重: 8.9, 关联宝宝: ['recvmSNnuni5bU'] },
    { record_id: 'g010', 测量日期: '2026-03-15', 身高: 72, 体重: 9.2, 关联宝宝: ['recvmSNnuni5bU'] },
  ];

  const tx = db.transaction(['babies', 'records', 'growth'], 'readwrite');
  await Promise.all([
    ...demoBabies.map((b) => tx.objectStore('babies').put(b)),
    ...demoRecords.map((r) => tx.objectStore('records').put(r)),
    ...demoGrowth.map((g) => tx.objectStore('growth').put(g)),
    tx.done,
  ]);
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
  // 删除关联的记录
  const recordsIdx = tx.objectStore('records').index('by-baby');
  let recCursor = await recordsIdx.openCursor(record_id);
  while (recCursor) {
    await recCursor.delete();
    recCursor = await recCursor.continue();
  }
  // 删除关联的成长记录
  const growthIdx = tx.objectStore('growth').index('by-baby');
  let growthCursor = await growthIdx.openCursor(record_id);
  while (growthCursor) {
    await growthCursor.delete();
    growthCursor = await growthCursor.continue();
  }
  await tx.done;
}

// Record CRUD
export async function dbGetRecords(babyId?: string): Promise<DailyRecord[]> {
  const db = await getDB();
  let records: DailyRecord[];
  if (babyId) {
    records = await db.getAllFromIndex('records', 'by-baby', babyId);
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

// Growth CRUD
export async function dbGetGrowthRecords(babyId: string): Promise<GrowthRecord[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex('growth', 'by-baby', babyId);
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
