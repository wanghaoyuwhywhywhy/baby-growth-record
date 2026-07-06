/**
 * 飞书云端同步 - Cloudflare Worker API 客户端
 */
import type { Baby, DailyRecord, GrowthRecord, VaccineRecord } from '@/api/feishu';
import { getAuthToken } from '@/lib/auth';

const WORKER_URL = 'https://api.tongxi.xyz';

// 获取认证头
function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) return { 'X-Auth-Token': token };
  return {};
}

// 飞书关联字段提取 record_ids
// 飞书返回格式: [{record_ids: ["recxxx"], text: "名称", type: "text"}, ...]
// 本地需要格式: ["recxxx"]
function extractLinkedIds(field: any): string[] {
  if (!field) return [];
  if (Array.isArray(field)) {
    // 如果是对象数组（飞书格式），提取 record_ids
    if (field.length > 0 && typeof field[0] === 'object' && field[0].record_ids) {
      return field.flatMap((item: any) => item.record_ids || []);
    }
    // 如果已经是字符串数组
    return field.filter((v: any) => typeof v === 'string');
  }
  if (typeof field === 'string') return [field];
  return [];
}

// 解析飞书文本字段：兼容纯字符串和飞书富文本数组 [{text: "xxx", type: "text"}]
function parseTextField(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item: any) => {
      if (typeof item === 'string') return item;
      if (item?.text) return item.text;
      return '';
    }).join('');
  }
  return String(value);
}

// 解析媒体类型：兼容多选数组、旧单选字符串、逗号分隔字符串
function parseMediaTypes(value: any): ('text' | 'voice' | 'video' | 'photo')[] {
  if (Array.isArray(value)) {
    // 飞书多选字段返回 ["text", "photo"]
    return value.filter((v: any) => typeof v === 'string') as any;
  }
  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map((v: string) => v.trim()) as any;
  }
  if (typeof value === 'string' && value) return [value] as any;
  return ['text'];
}

// 飞书多维表格字段 → 本地接口字段映射

function feishuToBaby(item: any): Baby {
  const fields = item.fields || {};
  return {
    record_id: item.record_id || item.id,
    宝宝姓名: parseTextField(fields['宝宝姓名']),
    出生日期: typeof fields['出生日期'] === 'number'
      ? new Date(fields['出生日期']).toISOString().split('T')[0]
      : fields['出生日期'] || '',
    性别: parseTextField(fields['性别']),
    妈妈名字: parseTextField(fields['妈妈名字']),
    爸爸名字: parseTextField(fields['爸爸名字']),
    头像: fields['头像'] || '',
    备注: parseTextField(fields['备注']),
  };
}

function feishuToRecord(item: any): DailyRecord {
  const fields = item.fields || {};
  // 提取附件字段的 file_tokens
  const attachmentField = fields['附件'];
  let mediaTokens: string[] = [];
  if (Array.isArray(attachmentField)) {
    mediaTokens = attachmentField
      .filter((a: any) => a.file_token)
      .map((a: any) => a.file_token);
  }
  // 也兼容旧的 媒体附件 文本字段
  const legacyMedia = fields['媒体附件'] || [];

  return {
    record_id: item.record_id || item.id,
    记录内容: fields['记录内容'] || '',
    分类: fields['分类'] || '',
    记录时间: typeof fields['记录时间'] === 'number'
      ? new Date(fields['记录时间']).toISOString()
      : fields['记录时间'] || '',
    上传时间: typeof fields['上传时间'] === 'number'
      ? new Date(fields['上传时间']).toISOString()
      : fields['上传时间'] || '',
    是否为里程碑: fields['是否为里程碑'] || false,
    关联宝宝: extractLinkedIds(fields['关联宝宝']),
    媒体附件: mediaTokens.length > 0 ? mediaTokens : legacyMedia,
    媒体类型: parseMediaTypes(fields['媒体类型']),
    语音转文字: fields['语音转文字'] || '',
  };
}

function feishuToGrowth(item: any): GrowthRecord {
  const fields = item.fields || {};
  return {
    record_id: item.record_id || item.id,
    测量日期: typeof fields['测量日期'] === 'number'
      ? new Date(fields['测量日期']).toISOString().split('T')[0]
      : fields['测量日期'] || '',
    身高: typeof fields['身高'] === 'string' ? parseFloat(fields['身高']) : fields['身高'] || undefined,
    体重: typeof fields['体重'] === 'string' ? parseFloat(fields['体重']) : fields['体重'] || undefined,
    头围: typeof fields['头围'] === 'string' ? parseFloat(fields['头围']) : fields['头围'] || undefined,
    备注: fields['备注'] || '',
    关联宝宝: extractLinkedIds(fields['关联宝宝']),
    最后修改时间: typeof fields['最后修改时间'] === 'number' ? fields['最后修改时间'] : undefined,
  };
}

// 日期转换：ISO 字符串 → 飞书要求的 unix 毫秒时间戳
function toTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

// API 调用

async function apiGet(path: string): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}`, {
    headers: { ...authHeaders() },
  });
  if (resp.status === 401) {
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('AUTH_EXPIRED');
  }
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiPost(path: string, fields: Record<string, any>): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ fields }),
  });
  if (resp.status === 401) {
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('AUTH_EXPIRED');
  }
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiPut(path: string, record_id: string, fields: Record<string, any>): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ record_id, fields }),
  });
  if (resp.status === 401) {
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('AUTH_EXPIRED');
  }
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiDelete(path: string, record_id: string): Promise<any> {
  const resp = await fetch(`${WORKER_URL}${path}?record_id=${encodeURIComponent(record_id)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (resp.status === 401) {
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('AUTH_EXPIRED');
  }
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
    if (record.媒体类型?.length) fields['媒体类型'] = record.媒体类型;
    if (record.语音转文字) fields['语音转文字'] = record.语音转文字;
    // 注意：附件字段通过上传 API 单独处理，不在创建记录时发送本地ID
    const data = await apiPost('/api/records', fields);
    // 检查飞书返回的错误
    if (data.code !== 0) {
      console.error('[cloudCreateRecord] 飞书返回错误:', data.code, data.msg, JSON.stringify(data).slice(0, 300));
      return null;
    }
    const recordId = data?.data?.record?.record_id;
    if (!recordId) {
      console.error('[cloudCreateRecord] 未获取到 record_id, 飞书响应:', JSON.stringify(data).slice(0, 300));
    }
    return recordId || null;
  } catch (e) {
    console.error('[cloudCreateRecord] 异常:', e);
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
      '最后修改时间': record.最后修改时间 || Date.now(),
    };
    if (record.身高 != null) fields['身高'] = record.身高;
    if (record.体重 != null) fields['体重'] = record.体重;
    if (record.头围 != null) fields['头围'] = record.头围;
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
    if (record.媒体类型?.length) fields['媒体类型'] = record.媒体类型;
    // 注意：附件字段通过上传 API 单独处理，不在更新记录时发送
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
      '最后修改时间': Date.now(),
    };
    if (record.身高 != null) fields['身高'] = record.身高;
    if (record.体重 != null) fields['体重'] = record.体重;
    if (record.头围 != null) fields['头围'] = record.头围;
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

// 上传媒体文件到飞书多维表格附件字段
export async function cloudUploadMedia(recordId: string, file: Blob, fileName: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('file', file, fileName);
    formData.append('record_id', recordId);

    console.log('[上传] 开始上传, recordId:', recordId, 'fileName:', fileName, 'fileSize:', file.size, 'fileType:', file.type);
    const resp = await fetch(`${WORKER_URL}/api/upload`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: formData,
    });
    const respText = await resp.text();
    console.log('[上传] Worker 响应:', resp.status, respText.slice(0, 500));
    if (resp.status === 401) {
      window.dispatchEvent(new Event('auth-expired'));
      throw new Error('AUTH_EXPIRED');
    }
    if (!resp.ok) throw new Error(`上传失败: HTTP ${resp.status}`);
    const data = JSON.parse(respText);
    if (!data.ok) throw new Error(data.error || data.detail || '上传失败');
    if (!data.file_token) throw new Error('上传成功但未获取到 file_token');
    console.log('[上传] 成功, file_token:', data.file_token);
    return data.file_token;
  } catch (e) {
    console.error('[上传] 云端上传媒体失败:', e);
    throw e; // 向上抛出，让调用方处理
  }
}

// 获取云端媒体文件的代理 URL
export function getCloudAssetUrl(recordId: string, fileToken: string, type?: 'voice' | 'photo' | 'video'): string {
  const token = getAuthToken();
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  const typeParam = type ? `&type=${type}` : '';
  return `${WORKER_URL}/api/asset?record_id=${encodeURIComponent(recordId)}&file_token=${encodeURIComponent(fileToken)}${tokenParam}${typeParam}`;
}

// 疫苗接种

function feishuToVaccine(item: any): VaccineRecord {
  const fields = item.fields || {};
  return {
    record_id: item.record_id || item.id,
    疫苗名称: fields['疫苗名称'] || '',
    剂次: Number(fields['剂次']) || 1,
    总剂次: Number(fields['总剂次']) || 1,
    费用类型: fields['费用类型'] || '免费',
    月龄: fields['月龄'] || '',
    预计接种时间: typeof fields['预计接种时间'] === 'number'
      ? new Date(fields['预计接种时间']).toISOString()
      : fields['预计接种时间'] || '',
    接种状态: fields['接种状态'] || '未接种',
    接种时间: typeof fields['接种时间'] === 'number'
      ? new Date(fields['接种时间']).toISOString()
      : fields['接种时间'] || '',
    关联宝宝: extractLinkedIds(fields['关联宝宝']),
  };
}

export async function cloudGetVaccines(babyId: string): Promise<VaccineRecord[]> {
  try {
    const data = await apiGet('/api/vaccines');
    if (data.code !== 0 || !data.data?.items) return [];
    const items: VaccineRecord[] = data.data.items.map(feishuToVaccine);
    return items.filter((v) => v.关联宝宝.includes(babyId));
  } catch (e) {
    console.warn('云端拉取疫苗记录失败:', e);
    return [];
  }
}

export async function cloudCreateVaccine(data: Partial<VaccineRecord>): Promise<VaccineRecord | null> {
  try {
    const fields: Record<string, any> = {};
    if (data.疫苗名称) fields['疫苗名称'] = data.疫苗名称;
    if (data.剂次) fields['剂次'] = data.剂次;
    if (data.总剂次) fields['总剂次'] = data.总剂次;
    if (data.费用类型) fields['费用类型'] = data.费用类型;
    if (data.月龄) fields['月龄'] = data.月龄;
    if (data.预计接种时间) fields['预计接种时间'] = toTimestamp(data.预计接种时间);
    if (data.接种状态) fields['接种状态'] = data.接种状态;
    if (data.接种时间) fields['接种时间'] = toTimestamp(data.接种时间);
    if (data.关联宝宝) fields['关联宝宝'] = data.关联宝宝;

    const result = await apiPost('/api/vaccines', fields);
    if (result.code !== 0) return null;
    const item = result.data?.record;
    if (!item) return null;
    return feishuToVaccine(item);
  } catch (e) {
    console.warn('云端创建疫苗记录失败:', e);
    return null;
  }
}

export async function cloudUpdateVaccine(record_id: string, rawFields: Record<string, any>): Promise<boolean> {
  try {
    const fields = { ...rawFields };
    if (fields['预计接种时间']) fields['预计接种时间'] = toTimestamp(fields['预计接种时间']);
    if (fields['接种时间']) fields['接种时间'] = toTimestamp(fields['接种时间']);
    await apiPut('/api/vaccines', record_id, fields);
    return true;
  } catch (e) {
    console.warn('云端更新疫苗记录失败:', e);
    return false;
  }
}

// 记录登录/登出日志
export async function cloudLogAccess(action: 'login' | 'logout'): Promise<void> {
  try {
    const device = navigator.userAgent;
    await fetch(`${WORKER_URL}/api/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        action,
        ip: '',
        device,
        timestamp: Date.now(),
      }),
    });
  } catch (e) {
    console.warn('登录日志记录失败:', e);
  }
}

// 账号管理

export interface AccountRecord {
  record_id: string;
  账号名: string;
  权限: string;
  状态: '正常' | '冻结' | '删除' | '待审批' | '审批未通过';
  hasPassword: boolean;
  最后修改时间: number | null;
}

export async function cloudGetAccounts(): Promise<AccountRecord[]> {
  try {
    const data = await apiGet('/api/accounts');
    if (data.code !== 0 || !data.data?.items) return [];
    return data.data.items.map((item: any) => ({
      record_id: item.record_id,
      账号名: item.账号名 || '',
      权限: item.权限 || 'view',
      状态: item.状态 || '正常',
      hasPassword: !!item.hasPassword,
      最后修改时间: item.最后修改时间 || null,
    }));
  } catch (e) {
    console.warn('云端拉取账号列表失败:', e);
    return [];
  }
}

export async function cloudCreateAccount(accountName: string, password: string): Promise<AccountRecord | null> {
  try {
    const fields: Record<string, any> = { accountName, password };
    const resp = await fetch(`${WORKER_URL}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(fields),
    });
    const data = await resp.json();
    if (data.code !== 0) return null;
    return data.data?.record || null;
  } catch (e) {
    console.warn('云端创建账号失败:', e);
    return null;
  }
}

export async function cloudUpdateAccount(record_id: string, updates: { password?: string; status?: string }): Promise<boolean> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/accounts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ record_id, ...updates }),
    });
    const data = await resp.json();
    return data.code === 0;
  } catch (e) {
    console.warn('云端更新账号失败:', e);
    return false;
  }
}

export async function cloudDeleteAccount(record_id: string): Promise<boolean> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/accounts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ record_id }),
    });
    const data = await resp.json();
    return data.code === 0;
  } catch (e) {
    console.warn('云端删除账号失败:', e);
    return false;
  }
}

// 自助注册
export async function cloudRegister(account: string, password: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', account, password }),
    });
    const data = await resp.json();
    return data;
  } catch (e) {
    console.warn('注册失败:', e);
    return { ok: false, error: '网络错误，请稍后重试' };
  }
}

// 审核通过（仅改状态为正常，不涉及权限）
export async function cloudApproveAccount(record_id: string): Promise<boolean> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/accounts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'approve', record_id }),
    });
    const data = await resp.json();
    return data.code === 0;
  } catch (e) {
    console.warn('审核通过失败:', e);
    return false;
  }
}

// 审核拒绝
export async function cloudRejectAccount(record_id: string): Promise<boolean> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/accounts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'reject', record_id }),
    });
    const data = await resp.json();
    return data.code === 0;
  } catch (e) {
    console.warn('审核拒绝失败:', e);
    return false;
  }
}

// 创建邀请码
export async function cloudCreateInvite(babyId: string, role: string, relation: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'create', babyId, role, relation }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: '网络错误' };
  }
}

// 使用邀请码
export async function cloudRedeemInvite(code: string): Promise<{ ok: boolean; babyId?: string; relation?: string; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'redeem', code }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: '网络错误' };
  }
}

// 获取宝宝联系人列表
export async function cloudGetBabyContacts(babyId: string): Promise<{ ok: boolean; contacts?: any[]; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'list', babyId }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: '网络错误' };
  }
}

// 移除联系人/取消邀请
export async function cloudRemoveContact(record_id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'remove', record_id }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: '网络错误' };
  }
}

// 更新联系人角色
export async function cloudUpdateContactRole(record_id: string, role: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'updateRole', record_id, role }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: '网络错误' };
  }
}

// 更新联系人信息（关系+权限）
export async function cloudUpdateContact(record_id: string, updates: { relation?: string; role?: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'updateContact', record_id, ...updates }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: '网络错误' };
  }
}
