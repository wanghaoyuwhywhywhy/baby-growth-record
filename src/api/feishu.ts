import {
  dbGetBabies, dbAddBaby, dbUpdateBaby, dbDeleteBaby,
  dbGetRecords, dbAddRecord,
  dbGetGrowthRecords, dbAddGrowthRecord, dbDeleteGrowthRecord,
  dbAddMedia, dbGetMediaByRecord, dbDeleteMedia,
  dbClearAll,
} from '@/lib/db';
import {
  cloudGetBabies, cloudCreateBaby, cloudUpdateBaby, cloudDeleteBaby,
  cloudGetRecords, cloudCreateRecord, cloudUpdateRecord, cloudDeleteRecord,
  cloudGetGrowth, cloudCreateGrowth, cloudUpdateGrowth, cloudDeleteGrowth,
  cloudHealthCheck,
} from '@/lib/cloud';

export interface Baby {
  record_id: string;
  宝宝姓名: string;
  出生日期: string;
  性别: string;
  妈妈名字?: string;
  爸爸名字?: string;
  头像?: string;
  备注?: string;
}

export interface MediaAttachment {
  id: string;
  type: 'image' | 'video';
  url: string; // ObjectURL for display
}

export interface DailyRecord {
  record_id: string;
  记录内容: string;
  分类: string;
  记录时间: string;
  是否为里程碑: boolean;
  关联宝宝: string[];
  媒体附件?: string[]; // media IDs
  媒体类型?: 'text' | 'voice' | 'video' | 'photo'; // 记录输入方式
}

export interface Milestone {
  record_id: string;
  里程碑名称: string;
  日期: string;
  备注?: string;
  关联宝宝: string[];
}

export interface GrowthRecord {
  record_id: string;
  测量日期: string;
  身高?: number;
  体重?: number;
  备注?: string;
  关联宝宝: string[];
}

export const feishuAPI = {
  async getBabies(): Promise<Baby[]> {
    return dbGetBabies();
  },

  async createBaby(data: Omit<Baby, 'record_id'>): Promise<Baby> {
    const baby: Baby = { ...data, record_id: `rec${Date.now()}` };
    // 先写云端，拿到飞书的 record_id
    const cloudId = await cloudCreateBaby(baby);
    if (cloudId) {
      baby.record_id = cloudId; // 用飞书返回的 ID 替换本地临时 ID
    }
    await dbAddBaby(baby);
    return baby;
  },

  async updateBaby(record_id: string, data: Partial<Omit<Baby, 'record_id'>>): Promise<Baby> {
    const babies = await dbGetBabies();
    const old = babies.find((b) => b.record_id === record_id);
    if (!old) throw new Error('宝宝不存在');
    const updated = { ...old, ...data };
    await dbUpdateBaby(updated);
    cloudUpdateBaby(updated); // 后台推送到云端
    return updated;
  },

  async deleteBaby(record_id: string): Promise<void> {
    await dbDeleteBaby(record_id);
    cloudDeleteBaby(record_id); // 后台推送到云端
  },

  async getRecords(filter?: { category?: string; babyId?: string }): Promise<DailyRecord[]> {
    let records = await dbGetRecords(filter?.babyId);
    if (filter?.category && filter.category !== '全部') {
      records = records.filter((r) => r.分类 === filter.category);
    }
    return records;
  },

  async getRecentRecords(limit: number = 5, babyId?: string): Promise<DailyRecord[]> {
    let records = await dbGetRecords(babyId);
    return records.slice(0, limit);
  },

  async createRecord(record: {
    记录内容: string;
    分类: string;
    是否为里程碑: boolean;
    关联宝宝: string;
    媒体类型?: 'text' | 'voice' | 'video' | 'photo';
    媒体附件?: string[];
  }): Promise<DailyRecord> {
    const newRecord: DailyRecord = {
      record_id: `rec${Date.now()}`,
      记录内容: record.记录内容,
      分类: record.分类,
      记录时间: new Date().toISOString(),
      是否为里程碑: record.是否为里程碑,
      关联宝宝: [record.关联宝宝],
      媒体附件: record.媒体附件,
      媒体类型: record.媒体类型 || 'text',
    };
    // 先写云端，拿到飞书的 record_id
    const cloudId = await cloudCreateRecord(newRecord);
    if (cloudId) {
      newRecord.record_id = cloudId;
    }
    await dbAddRecord(newRecord);
    return newRecord;
  },

  async getGrowthRecords(babyId: string): Promise<GrowthRecord[]> {
    return dbGetGrowthRecords(babyId);
  },

  async createGrowthRecord(record: {
    测量日期: string;
    身高?: number;
    体重?: number;
    备注?: string;
    关联宝宝: string;
  }): Promise<GrowthRecord> {
    const newRecord: GrowthRecord = {
      record_id: `g${Date.now()}`,
      测量日期: record.测量日期,
      身高: record.身高,
      体重: record.体重,
      备注: record.备注,
      关联宝宝: [record.关联宝宝],
    };
    // 先写云端，拿到飞书的 record_id
    const cloudId = await cloudCreateGrowth(newRecord);
    if (cloudId) {
      newRecord.record_id = cloudId;
    }
    await dbAddGrowthRecord(newRecord);
    return newRecord;
  },

  async deleteGrowthRecord(record_id: string): Promise<void> {
    await dbDeleteGrowthRecord(record_id);
    cloudDeleteGrowth(record_id); // 后台推送到云端
  },

  // 媒体附件
  async addMedia(id: string, type: 'image' | 'video', blob: Blob, recordId: string): Promise<void> {
    await dbAddMedia(id, type, blob, recordId);
  },

  async getMediaByRecord(recordId: string): Promise<{ id: string; type: 'image' | 'video'; blob: Blob; recordId: string; createdAt: string }[]> {
    return dbGetMediaByRecord(recordId);
  },

  async deleteMedia(id: string): Promise<void> {
    await dbDeleteMedia(id);
  },

  // 云端同步：先清空本地再写入云端数据（确保多端一致）
  async syncFromCloud(): Promise<{ babies: number; records: number; growth: number }> {
    const [cloudBabies, cloudRecords, cloudGrowth] = await Promise.all([
      cloudGetBabies(),
      cloudGetRecords(),
      cloudGetGrowth(),
    ]);

    // 先清空本地数据，再写入云端数据
    await dbClearAll();

    let babiesSynced = 0;
    for (const baby of cloudBabies) {
      await dbAddBaby(baby);
      babiesSynced++;
    }

    let recordsSynced = 0;
    for (const record of cloudRecords) {
      await dbAddRecord(record);
      recordsSynced++;
    }

    let growthSynced = 0;
    for (const g of cloudGrowth) {
      await dbAddGrowthRecord(g);
      growthSynced++;
    }

    return { babies: babiesSynced, records: recordsSynced, growth: growthSynced };
  },

  async checkCloudConnection(): Promise<boolean> {
    return cloudHealthCheck();
  },
};
