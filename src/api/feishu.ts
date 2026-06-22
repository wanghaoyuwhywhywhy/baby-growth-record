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

export interface DailyRecord {
  record_id: string;
  记录内容: string;
  分类: string;
  记录时间: string;
  是否为里程碑: boolean;
  关联宝宝: string[];
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

const DEMO_BABIES: Baby[] = [
  {
    record_id: 'recvmSNnuni5bU',
    宝宝姓名: '小宝',
    出生日期: '2025-06-15',
    性别: '男',
    妈妈名字: '妈妈',
    爸爸名字: '爸爸',
    备注: '一个可爱的小宝贝',
  },
  {
    record_id: 'recBaby002',
    宝宝姓名: '二宝',
    出生日期: '2026-03-08',
    性别: '女',
    妈妈名字: '妈妈',
    爸爸名字: '爸爸',
    备注: '家里的小公主',
  },
];

const DEMO_RECORDS: DailyRecord[] = [
  { record_id: 'rec001', 记录内容: '今天第一次清楚地叫了“妈妈”，太感动了！', 分类: '语言', 记录时间: new Date(Date.now() - 3600000).toISOString(), 是否为里程碑: true, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec002', 记录内容: '午饭吃了半碗米糊加胡萝卜泥，胃口不错', 分类: '饮食', 记录时间: new Date(Date.now() - 5 * 3600000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec003', 记录内容: '上午睡了2小时，下午睡了1.5小时', 分类: '睡眠', 记录时间: new Date(Date.now() - 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec004', 记录内容: '扶着沙发走了三小步！虽然摇摇晃晃的', 分类: '运动', 记录时间: new Date(Date.now() - 2 * 86400000).toISOString(), 是否为里程碑: true, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec005', 记录内容: '今天打了疫苗，哭了两声就停了，很勇敢', 分类: '健康', 记录时间: new Date(Date.now() - 3 * 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec006', 记录内容: '在公园看到狗狗特别兴奋，一直指着叫', 分类: '其他', 记录时间: new Date(Date.now() - 4 * 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
];

const DEMO_GROWTH_RECORDS: GrowthRecord[] = [
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

export const feishuAPI = {
  async getBabies(): Promise<Baby[]> {
    return [...DEMO_BABIES];
  },

  async createBaby(data: Omit<Baby, 'record_id'>): Promise<Baby> {
    const newBaby: Baby = {
      ...data,
      record_id: `rec${Date.now()}`,
    };
    DEMO_BABIES.push(newBaby);
    return newBaby;
  },

  async updateBaby(record_id: string, data: Partial<Omit<Baby, 'record_id'>>): Promise<Baby> {
    const idx = DEMO_BABIES.findIndex((b) => b.record_id === record_id);
    if (idx === -1) throw new Error('宝宝不存在');
    DEMO_BABIES[idx] = { ...DEMO_BABIES[idx], ...data };
    return DEMO_BABIES[idx];
  },

  async deleteBaby(record_id: string): Promise<void> {
    const idx = DEMO_BABIES.findIndex((b) => b.record_id === record_id);
    if (idx !== -1) DEMO_BABIES.splice(idx, 1);
  },

  async getRecords(filter?: { category?: string; babyId?: string }): Promise<DailyRecord[]> {
    let records = [...DEMO_RECORDS];
    if (filter?.babyId) {
      records = records.filter((r) => r.关联宝宝.includes(filter.babyId!));
    }
    if (filter?.category && filter.category !== '全部') {
      records = records.filter((r) => r.分类 === filter.category);
    }
    records.sort((a, b) => new Date(b.记录时间).getTime() - new Date(a.记录时间).getTime());
    return records;
  },

  async getRecentRecords(limit: number = 5, babyId?: string): Promise<DailyRecord[]> {
    let records = [...DEMO_RECORDS];
    if (babyId) {
      records = records.filter((r) => r.关联宝宝.includes(babyId));
    }
    records.sort((a, b) => new Date(b.记录时间).getTime() - new Date(a.记录时间).getTime());
    return records.slice(0, limit);
  },

  async createRecord(record: { 记录内容: string; 分类: string; 是否为里程碑: boolean; 关联宝宝: string }): Promise<DailyRecord> {
    const newRecord: DailyRecord = {
      record_id: `rec${Date.now()}`,
      记录内容: record.记录内容,
      分类: record.分类,
      记录时间: new Date().toISOString(),
      是否为里程碑: record.是否为里程碑,
      关联宝宝: [record.关联宝宝],
    };
    DEMO_RECORDS.unshift(newRecord);
    return newRecord;
  },

  async getGrowthRecords(babyId: string): Promise<GrowthRecord[]> {
    const records = DEMO_GROWTH_RECORDS.filter((r) => r.关联宝宝.includes(babyId));
    records.sort((a, b) => new Date(a.测量日期).getTime() - new Date(b.测量日期).getTime());
    return records;
  },

  async createGrowthRecord(record: { 测量日期: string; 身高?: number; 体重?: number; 备注?: string; 关联宝宝: string }): Promise<GrowthRecord> {
    const newRecord: GrowthRecord = {
      record_id: `g${Date.now()}`,
      测量日期: record.测量日期,
      身高: record.身高,
      体重: record.体重,
      备注: record.备注,
      关联宝宝: [record.关联宝宝],
    };
    DEMO_GROWTH_RECORDS.push(newRecord);
    return newRecord;
  },

  async deleteGrowthRecord(record_id: string): Promise<void> {
    const idx = DEMO_GROWTH_RECORDS.findIndex((r) => r.record_id === record_id);
    if (idx !== -1) DEMO_GROWTH_RECORDS.splice(idx, 1);
  },
};
