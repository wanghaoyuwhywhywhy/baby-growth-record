import {
  dbGetBabies, dbAddBaby, dbUpdateBaby, dbDeleteBaby,
  dbGetRecords, dbAddRecord, dbUpdateRecordMedia,
  dbGetGrowthRecords, dbAddGrowthRecord, dbDeleteGrowthRecord,
  dbAddMedia, dbGetMediaByRecord, dbDeleteMedia,
  dbClearAll,
} from '@/lib/db';
import {
  cloudGetBabies, cloudCreateBaby, cloudUpdateBaby, cloudDeleteBaby,
  cloudGetRecords, cloudCreateRecord, cloudUpdateRecord, cloudDeleteRecord,
  cloudGetGrowth, cloudCreateGrowth, cloudUpdateGrowth, cloudDeleteGrowth,
  cloudHealthCheck, cloudLogAccess,
  cloudGetVaccines, cloudCreateVaccine, cloudUpdateVaccine,
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
  上传时间?: string; // 上传时间，后端字段，前端不展示
  是否为里程碑: boolean;
  关联宝宝: string[];
  媒体附件?: string[]; // media IDs
  媒体类型?: ('text' | 'voice' | 'video' | 'photo')[]; // 多选：可同时包含多种
  语音转文字?: string; // 语音识别转写的文字（独立字段，不填入记录内容）
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

export interface VaccineRecord {
  record_id: string;
  疫苗名称: string;
  剂次: number;
  总剂次: number;
  费用类型: '免费' | '付费';
  月龄: string;
  预计接种时间: string;
  接种状态: '未接种' | '已接种';
  接种时间?: string;
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
    媒体类型?: ('text' | 'voice' | 'video' | 'photo')[];
    媒体附件?: string[];
    语音转文字?: string;
  }): Promise<DailyRecord> {
    const newRecord: DailyRecord = {
      record_id: `rec${Date.now()}`,
      记录内容: record.记录内容,
      分类: record.分类,
      记录时间: new Date().toISOString(),
      是否为里程碑: record.是否为里程碑,
      关联宝宝: [record.关联宝宝],
      媒体附件: record.媒体附件,
      媒体类型: record.媒体类型 || ['text'],
      语音转文字: record.语音转文字,
    };
    // 先写云端，拿到飞书的 record_id
    const cloudId = await cloudCreateRecord(newRecord);
    if (!cloudId) {
      throw new Error('云端创建记录失败，请检查网络连接后重试');
    }
    newRecord.record_id = cloudId;
    await dbAddRecord(newRecord);
    return newRecord;
  },

  async getGrowthRecords(babyId: string): Promise<GrowthRecord[]> {
    return dbGetGrowthRecords(babyId);
  },

  async updateRecord(record_id: string, data: { 记录时间?: string; 分类?: string }): Promise<DailyRecord | null> {
    const allRecords = await dbGetRecords();
    const old = allRecords.find(r => r.record_id === record_id);
    if (!old) return null;
    const updated = { ...old, ...data };
    await dbAddRecord(updated); // put 会覆盖
    cloudUpdateRecord(updated); // 后台推送到云端
    return updated;
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
  async addMedia(id: string, type: 'image' | 'video' | 'voice', blob: Blob, recordId: string): Promise<void> {
    await dbAddMedia(id, type, blob, recordId);
  },

  async updateRecordMedia(recordId: string, mediaTokens: string[]): Promise<void> {
    await dbUpdateRecordMedia(recordId, mediaTokens);
  },

  async getMediaByRecord(recordId: string): Promise<{ id: string; type: 'image' | 'video' | 'voice'; blob: Blob; recordId: string; createdAt: string }[]> {
    return dbGetMediaByRecord(recordId);
  },

  async deleteMedia(id: string): Promise<void> {
    await dbDeleteMedia(id);
  },

  // 云端同步：先清空本地再写入云端数据（确保多端一致）
  async syncFromCloud(): Promise<{ babies: number; records: number; growth: number }> {
    // 使用 allSettled 避免单个请求失败导致整个同步中断
    const [babiesResult, recordsResult, growthResult] = await Promise.allSettled([
      cloudGetBabies(),
      cloudGetRecords(),
      cloudGetGrowth(),
    ]);

    const cloudBabies = babiesResult.status === 'fulfilled' ? babiesResult.value : [];
    const cloudRecords = recordsResult.status === 'fulfilled' ? recordsResult.value : [];
    const cloudGrowth = growthResult.status === 'fulfilled' ? growthResult.value : [];

    if (cloudBabies.length === 0 && cloudRecords.length === 0 && cloudGrowth.length === 0) {
      console.warn('[syncFromCloud] 所有云端请求失败，保留本地数据');
      return { babies: 0, records: 0, growth: 0 };
    }

    // 清空本地数据，批量写入云端数据
    await dbClearAll();

    // 并行写入三类数据
    const [babiesSynced, recordsSynced, growthSynced] = await Promise.all([
      Promise.all(cloudBabies.map(b => dbAddBaby(b))).then(() => cloudBabies.length),
      Promise.all(cloudRecords.map(r => dbAddRecord(r))).then(() => cloudRecords.length),
      Promise.all(cloudGrowth.map(g => dbAddGrowthRecord(g))).then(() => cloudGrowth.length),
    ]);

    return { babies: babiesSynced, records: recordsSynced, growth: growthSynced };
  },

  async checkCloudConnection(): Promise<boolean> {
    return cloudHealthCheck();
  },

  async logAccess(action: 'login' | 'logout'): Promise<void> {
    return cloudLogAccess(action);
  },

  // 疫苗接种
  async getVaccines(babyId: string): Promise<VaccineRecord[]> {
    return cloudGetVaccines(babyId);
  },

  async createVaccine(data: Partial<VaccineRecord>): Promise<VaccineRecord | null> {
    return cloudCreateVaccine(data);
  },

  async updateVaccine(record_id: string, fields: Record<string, any>): Promise<boolean> {
    return cloudUpdateVaccine(record_id, fields);
  },
};
