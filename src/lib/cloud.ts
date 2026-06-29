/**
 * 飞书云端同步 - Cloudflare Worker API 客户端
 */
import type { Baby, DailyRecord, GrowthRecord } from '@/api/feishu';

const WORKER_URL = 'https://api.tongxi.xyz';

// 飞书多维表格字段 → 本地接口字段映射

function feishuToBaby(item: any): Baby {
  const fields = item.fields || {};
  return {
    record_id: item.record_id || item.id,
    宝宝姓名: fields['宝宝姓名'] || '',
    出生日期: typeof fields['出生日期'] === 'number'
      ? new Date(fields['出生日期']).toISOString().split('T')[0]
      : fields['出生日期'] || '',
    性别: fields['性别'] || '',
    妈妈名字: fields['妈妈名字'] || '',
    爸爸名字: fields['爸爸名字'] || '',
    头像: fields['头像'] || '',
    备注: fields['备注'] || '',
  };
}

function feishuToRecord(item: any): DailyRecord {
  const fields = item.fields || {};
  let 关联宝宝: string[] = fields['关联宝宝'] || [];
  if (typeof 关联宝宝 === 'string') 关联宝宝 = [关联宝宝];
  return {
    record_id: item.record_id || item.id,
    记录内容: fields['记录内容'] || '',
    分类: fields['分类'] || '',
    记录时间: typeof fields['记录时间'] === 'number'
      ? new Date(fields['记录时间']).toISOString()
      : fields['记录时间'] || '',
    是否为里程碑: fields['是否为里程碑'] || false,
    关联宝宝,
    媒体附件: fields['媒体附件'] || [],
  };
}

function feishuToGrowth(item: any): GrowthRecord {
  const fields = item.fields || {};
  let 关联宝宝: string[] = fields['关联宝宝'] || [];
  if (typeof 关联宝宝 === 'string') 关联宝宝 = [关联宝宝];
  return {
    record_id: item.record_id || item.id,
    测量日期: typeof fields['测量日期'] === 'number'
      ? new Date(fields['测量日期']).toISOString().split('T')[0]
      : fields['测量日期'] || '',
    身高: fields['身高'] || undefined,
    体重: fields['体重'] || undefined,
    备注: fields['备注'] || '',
    关联宝宝,
  };
}

// 日期转换：ISO 字符串 → 飞书要求的 unix 毫秒时间戳
function toTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

// API 调用

async function apiGet(path: string): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}`);
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiPost(path: string, fields: Record<string, any>): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiPut(path: string, record_id: string, fields: Record<string, any>): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_id, fields }),
  });
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiDelete(path: string, record_id: string): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}?record_id=${encodeURIComponent(record_id)}`, {
    method: 'DELETE',
  });
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

// 导出的同步函数

export async function cloudGetBabies(): Promise<Baby[]> {
  try {
    const data = await apiGet('/api/babies');
    if (data.code !== 0 || !data.data?.items) return [];
    return data.data.items.map(feishuToBaby);
  } catch (e) {
    console.warn('云端拉取宝宝列表失败:', e);
    return [];
  }
}

export async function cloudCreateBaby(baby: Baby): Promise<string | null> {
  try {
    const fields: Record<string, any> = {
      '宝宝姓名': baby.宝宝姓名,
      '出生日期': toTimestamp(baby.出生日期),
      '性别': baby.性别,
    };
    if (baby.妈妈名字) fields['妈妈名字'] = baby.妈妈名字;
    if (baby.爸爸名字) fields['爸爸名字'] = baby.爸爸名字;
    if (baby.备注) fields['备注'] = baby.备注;
    const data = await apiPost('/api/babies', fields);
    // 返回飞书生成的 record_id
    return data?.data?.record?.record_id || null;
  } catch (e) {
    console.warn('云端创建宝宝失败:', e);
    return null;
  }
}

export async function cloudGetRecords(): Promise<DailyRecord[]> {
  try {
    const data = await apiGet('/api/records');
    if (data.code !== 0 || !data.data?.items) return [];
    return data.data.items.map(feishuToRecord);
  } catch (e) {
    console.warn('云端拉取记录失败:', e);
    return [];
  }
}

export async function cloudCreateRecord(record: DailyRecord): Promise<string | null> {
  try {
    const fields: Record<string, any> = {
      '记录内容': record.记录内容,
      '分类': record.分类,
      '记录时间': toTimestamp(record.记录时间),
      '是否为里程碑': record.是否为里程碑,
      '关联宝宝': record.关联宝宝,
    };
    if (record.媒体附件?.length) fields['媒体附件'] = record.媒体附件;
    const data = await apiPost('/api/records', fields);
    return data?.data?.record?.record_id || null;
  } catch (e) {
    console.warn('云端创建记录失败:', e);
    return null;
  }
}

export async function cloudGetGrowth(): Promise<GrowthRecord[]> {
  try {
    const data = await apiGet('/api/growth');
    if (data.code !== 0 || !data.data?.items) return [];
    return data.data.items.map(feishuToGrowth);
  } catch (e) {
    console.warn('云端拉取成长记录失败:', e);
    return [];
  }
}

export async function cloudCreateGrowth(record: GrowthRecord): Promise<string | null> {
  try {
    const fields: Record<string, any> = {
      '测量日期': toTimestamp(record.测量日期),
      '关联宝宝': record.关联宝宝,
    };
    if (record.身高 != null) fields['身高'] = record.身高;
    if (record.体重 != null) fields['体重'] = record.体重;
    if (record.备注) fields['备注'] = record.备注;
    const data = await apiPost('/api/growth', fields);
    return data?.data?.record?.record_id || null;
  } catch (e) {
    console.warn('云端创建成长记录失败:', e);
    return null;
  }
}

export async function cloudUpdateBaby(baby: Baby): Promise<boolean> {
  try {
    const fields: Record<string, any> = {
      '宝宝姓名': baby.宝宝姓名,
      '出生日期': toTimestamp(baby.出生日期),
      '性别': baby.性别,
    };
    if (baby.妈妈名字) fields['妈妈名字'] = baby.妈妈名字;
    if (baby.爸爸名字) fields['爸爸名字'] = baby.爸爸名字;
    if (baby.备注) fields['备注'] = baby.备注;
    await apiPut('/api/babies', baby.record_id, fields);
    return true;
  } catch (e) {
    console.warn('云端更新宝宝失败:', e);
    return false;
  }
}

export async function cloudDeleteBaby(record_id: string): Promise<boolean> {
  try {
    await apiDelete('/api/babies', record_id);
    return true;
  } catch (e) {
    console.warn('云端删除宝宝失败:', e);
    return false;
  }
}

export async function cloudUpdateRecord(record: DailyRecord): Promise<boolean> {
  try {
    const fields: Record<string, any> = {
      '记录内容': record.记录内容,
      '分类': record.分类,
      '记录时间': toTimestamp(record.记录时间),
      '是否为里程碑': record.是否为里程碑,
      '关联宝宝': record.关联宝宝,
    };
    if (record.媒体附件?.length) fields['媒体附件'] = record.媒体附件;
    await apiPut('/api/records', record.record_id, fields);
    return true;
  } catch (e) {
    console.warn('云端更新记录失败:', e);
    return false;
  }
}

export async function cloudDeleteRecord(record_id: string): Promise<boolean> {
  try {
    await apiDelete('/api/records', record_id);
    return true;
  } catch (e) {
    console.warn('云端删除记录失败:', e);
    return false;
  }
}

export async function cloudUpdateGrowth(record: GrowthRecord): Promise<boolean> {
  try {
    const fields: Record<string, any> = {
      '测量日期': toTimestamp(record.测量日期),
      '关联宝宝': record.关联宝宝,
    };
    if (record.身高 != null) fields['身高'] = record.身高;
    if (record.体重 != null) fields['体重'] = record.体重;
    if (record.备注) fields['备注'] = record.备注;
    await apiPut('/api/growth', record.record_id, fields);
    return true;
  } catch (e) {
    console.warn('云端更新成长记录失败:', e);
    return false;
  }
}

export async function cloudDeleteGrowth(record_id: string): Promise<boolean> {
  try {
    await apiDelete('/api/growth', record_id);
    return true;
  } catch (e) {
    console.warn('云端删除成长记录失败:', e);
    return false;
  }
}

// 健康检查
export async function cloudHealthCheck(): Promise<boolean> {
  try {
    const data = await apiGet('/api/health');
    return data.ok === true;
  } catch {
    return false;
  }
}
