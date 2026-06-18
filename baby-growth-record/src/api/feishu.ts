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

const DEMO_BABY: Baby = {
  record_id: 'recvmSNnuni5bU',
  宝宝姓名: '小宝',
  出生日期: '2025-06-15',
  性别: '男',
  妈妈名字: '妈妈',
  爸爸名字: '爸爸',
  备注: '一个可爱的小宝贝',
};

const DEMO_RECORDS: DailyRecord[] = [
  { record_id: 'rec001', 记录内容: '今天第一次清楚地叫了“妈妈”，太感动了！', 分类: '语言', 记录时间: new Date(Date.now() - 3600000).toISOString(), 是否为里程碑: true, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec002', 记录内容: '午饭吃了半碗米糊加胡萝卜泥，胃口不错', 分类: '饮食', 记录时间: new Date(Date.now() - 5 * 3600000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec003', 记录内容: '上午睡了2小时，下午睡了1.5小时', 分类: '睡眠', 记录时间: new Date(Date.now() - 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec004', 记录内容: '扶着沙发走了三小步！虽然摇摇晃晃的', 分类: '运动', 记录时间: new Date(Date.now() - 2 * 86400000).toISOString(), 是否为里程碑: true, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec005', 记录内容: '今天打了疫苗，哭了两声就停了，很勇敢', 分类: '健康', 记录时间: new Date(Date.now() - 3 * 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
  { record_id: 'rec006', 记录内容: '在公园看到狗狗特别兴奋，一直指着叫', 分类: '其他', 记录时间: new Date(Date.now() - 4 * 86400000).toISOString(), 是否为里程碑: false, 关联宝宝: ['recvmSNnuni5bU'] },
];

export const feishuAPI = {
  async getBabies(): Promise<Baby[]> {
    return [DEMO_BABY];
  },

  async getRecords(filter?: { category?: string }): Promise<DailyRecord[]> {
    let records = [...DEMO_RECORDS];
    if (filter?.category && filter.category !== '全部') {
      records = records.filter((r) => r.分类 === filter.category);
    }
    records.sort((a, b) => new Date(b.记录时间).getTime() - new Date(a.记录时间).getTime());
    return records;
  },

  async getRecentRecords(limit: number = 5): Promise<DailyRecord[]> {
    const records = [...DEMO_RECORDS];
    records.sort((a, b) => new Date(b.记录时间).getTime() - new Date(a.记录时间).getTime());
    return records.slice(0, limit);
  },

  async createRecord(record: { 记录内容: string; 分类: string; 是否为里程碑: boolean }): Promise<DailyRecord> {
    const newRecord: DailyRecord = {
      record_id: `rec${Date.now()}`,
      记录内容: record.记录内容,
      分类: record.分类,
      记录时间: new Date().toISOString(),
      是否为里程碑: record.是否为里程碑,
      关联宝宝: ['recvmSNnuni5bU'],
    };
    DEMO_RECORDS.unshift(newRecord);
    return newRecord;
  },
};
