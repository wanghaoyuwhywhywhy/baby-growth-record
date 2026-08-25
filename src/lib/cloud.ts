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
export function extractLinkedIds(field: any): string[] {
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
export function parseTextField(value: any): string {
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
// 兼容两种输入：1) 飞书原始格式（有fields属性） 2) Worker已转换的扁平格式（无fields属性）

function feishuToBaby(item: any): Baby {
  const fields = item.fields || item; // 兼容已转换的扁平对象
  return {
    record_id: item.record_id || item.id,
    宝宝姓名: parseTextField(fields['宝宝姓名']),
    出生日期: typeof fields['出生日期'] === 'number'
      ? new Date(fields['出生日期']).toISOString().split('T')[0]
      : fields['出生日期'] || '',
    性别: parseTextField(fields['性别']),
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

// 给 fetch 加超时：避免后端卡住时前端一直转圈无响应（默认 30s）
const DEFAULT_TIMEOUT_MS = 30000;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// API 调用

async function apiGet(path: string, timeoutMs?: number): Promise<any> {
  const resp = await fetchWithTimeout(`${WORKER_URL}${path}`, {
    headers: { ...authHeaders() },
  }, timeoutMs);
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiPost(path: string, fields: Record<string, any>, timeoutMs?: number): Promise<any> {
  const resp = await fetchWithTimeout(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ fields }),
  }, timeoutMs);
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiPut(path: string, record_id: string, fields: Record<string, any>, timeoutMs?: number): Promise<any> {
  const resp = await fetchWithTimeout(`${WORKER_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ record_id, fields }),
  }, timeoutMs);
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
  return resp.json();
}

async function apiDelete(path: string, record_id: string, timeoutMs?: number): Promise<any> {
  const resp = await fetchWithTimeout(`${WORKER_URL}${path}?record_id=${encodeURIComponent(record_id)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  }, timeoutMs);
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
    if (baby.备注) fields['备注'] = baby.备注;
    const data = await apiPost('/api/babies', fields);
    // 返回飞书生成的 record_id
    return data?.data?.record?.record_id || null;
  } catch (e) {
    console.warn('云端创建宝宝失败:', e);
    return null;
  }
}

export async function cloudGetRecords(): Promise<{ records: DailyRecord[]; hasMore: boolean }> {
  try {
    const data = await apiGet('/api/records');
    if (data.code !== 0 || !data.data?.items) return { records: [], hasMore: false };
    return { records: data.data.items.map(feishuToRecord), hasMore: !!data.data.has_more };
  } catch (e) {
    console.warn('云端拉取记录失败:', e);
    return { records: [], hasMore: false };
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
    // AbortError 是 fetchWithTimeout 超时触发；让上层知道具体原因
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('请求超时（30秒），请检查网络后重试');
    }
    if (e instanceof TypeError) {
      throw new Error(`网络错误：${e.message}，请检查网络后重试`);
    }
    return null;
  }
}

export async function cloudGetGrowth(): Promise<{ records: GrowthRecord[]; hasMore: boolean }> {
  try {
    const data = await apiGet('/api/growth');
    if (data.code !== 0 || !data.data?.items) return { records: [], hasMore: false };
    return { records: data.data.items.map(feishuToGrowth), hasMore: !!data.data.has_more };
  } catch (e) {
    console.warn('云端拉取成长记录失败:', e);
    return { records: [], hasMore: false };
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

    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    console.log('[上传] 开始上传, recordId:', recordId, 'fileName:', fileName, 'fileSize:', sizeMB + 'MB', 'fileType:', file.type);
    const resp = await fetch(`${WORKER_URL}/api/upload`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: formData,
    });
    const respText = await resp.text();
    console.log('[上传] Worker 响应:', resp.status, respText.slice(0, 500));
    if (!resp.ok) {
      // 413 = 超过 Cloudflare Workers 100MB 请求体限制
      if (resp.status === 413) {
        throw new Error(`文件过大（${sizeMB}MB），超过 100MB 上限，请先用手机压缩`);
      }
      // 读取 Worker 返回的具体 error 字段（顶层 catch 会返回 {error: ...}）
      let detail = '';
      try {
        const errJson = JSON.parse(respText);
        detail = errJson?.error || errJson?.detail || errJson?.msg || '';
      } catch {
        detail = respText.slice(0, 200);
      }
      throw new Error(detail ? `上传失败(HTTP ${resp.status}): ${detail}` : `上传失败: HTTP ${resp.status}`);
    }
    const data = JSON.parse(respText);
    if (!data.ok) throw new Error(data.error || data.detail || '上传失败');
    if (!data.file_token) throw new Error('上传成功但未获取到 file_token');
    console.log('[上传] 成功, file_token:', data.file_token);
    return data.file_token;
  } catch (e) {
    console.error('[上传] 云端上传媒体失败:', e);
    // 浏览器原生 fetch 抛出的"Load failed"/"Failed to fetch"通常是网络层中断或请求体过大被网关截断
    if (e instanceof TypeError) {
      const hint = file.size > 80 * 1024 * 1024
        ? `（文件 ${(file.size / 1024 / 1024).toFixed(1)}MB 可能过大，建议压缩到 80MB 以内）`
        : '（网络中断，请检查 WiFi/移动数据后重试）';
      throw new Error(`网络错误 ${e.message}${hint}`);
    }
    throw e; // 向上抛出，让调用方处理
  }
}

// 获取云端媒体文件的代理 URL
// 注意：不再把用户 token 拼到 URL 查询参数（避免 token 进入服务器日志/浏览器历史/Referer）。
// 媒体鉴权由 Worker 端租户 token 完成，前端无需传递用户 token。
export function getCloudAssetUrl(recordId: string, fileToken: string, type?: 'voice' | 'photo' | 'video'): string {
  const typeParam = type ? `&type=${type}` : '';
  return `${WORKER_URL}/api/asset?record_id=${encodeURIComponent(recordId)}&file_token=${encodeURIComponent(fileToken)}${typeParam}`;
}

import {
  dbGetMediaCache,
  dbPutMediaCache,
  type MediaCacheEntry,
} from '@/lib/db';

/**
 * 加载云端媒体 Blob，优先读本地 IndexedDB 缓存，零延迟显示。
 * 缓存未命中时再请求网络，并把响应写入缓存供下次使用。
 *
 * 一致性说明：飞书 file_token 内容不可变（替换附件会生成新 token），
 * 因此本地缓存长期有效，不会出现"旧数据"问题。
 *
 * @returns Promise<{ blob: Blob; contentType: string; fromCache: boolean }>
 */
export async function fetchCachedCloudAsset(
  recordId: string,
  fileToken: string,
  type?: 'voice' | 'photo' | 'video',
): Promise<{ blob: Blob; contentType: string; fromCache: boolean }> {
  if (!fileToken) throw new Error('fileToken is required');

  // ---- 第 1 步：IndexedDB 本地缓存（最快，无网络）----
  const cached = await dbGetMediaCache(fileToken);
  if (cached) {
    return {
      blob: cached.blob,
      contentType: cached.contentType,
      fromCache: true,
    };
  }

  // ---- 第 2 步：网络请求（带 ETag 条件验证，304 不下载 body）----
  const url = getCloudAssetUrl(recordId, fileToken, type);
  const headersInit: Record<string, string> = {};

  // 正常这里 cached 为 null，暂时没 etag；预留接口以便后续扩展"后台验证"
  // （例如：本地缓存先显示，后台 If-None-Match 验证，304 继续用，200 静默更新）

  const resp = await fetchWithTimeout(url, { headers: headersInit });
  if (!resp.ok && resp.status !== 304) {
    throw new Error(`媒体加载失败: HTTP ${resp.status}`);
  }

  let blob: Blob;
  let contentType: string;
  let etag: string = resp.headers.get('ETag') || '';
  let size: number = 0;

  if (resp.status === 304) {
    // 304 但本地没缓存？不太可能发生（304 需要先发 If-None-Match），防御式处理
    throw new Error('服务器返回 304 但本地无缓存');
  }

  // 200：读取 blob
  const arrayBuf = await resp.arrayBuffer();
  contentType = resp.headers.get('Content-Type') || guessContentType(type, arrayBuf);
  size = arrayBuf.byteLength;
  blob = new Blob([arrayBuf], { type: contentType });

  // 生成稳定 ETag（如果服务端没返回，按 file_token 自己算一个保底）
  if (!etag) {
    etag = 'local/' + fileToken.slice(0, 16);
  }

  // ---- 第 3 步：写入 IndexedDB 缓存（后台异步 LRU 清理）----
  const entry: MediaCacheEntry = {
    fileToken,
    blob,
    etag,
    contentType,
    size,
    lastUsedAt: Date.now(),
    createdAt: Date.now(),
  };
  dbPutMediaCache(entry).catch((e) => {
    console.warn('[fetchCachedCloudAsset] 写入媒体缓存失败（可能是存储空间不足）:', e);
  });

  return { blob, contentType, fromCache: false };
}

// 根据 type 和文件头猜 Content-Type（服务端异常没返回时的兜底）
function guessContentType(type: 'voice' | 'photo' | 'video' | undefined, header: ArrayBuffer): string {
  const magic = new Uint8Array(header.slice(0, 12));
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPNG = magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4E && magic[3] === 0x47;
  if (isPNG) return 'image/png';
  // JPEG: FF D8 FF
  const isJPEG = magic[0] === 0xFF && magic[1] === 0xD8 && magic[2] === 0xFF;
  if (isJPEG) return 'image/jpeg';
  // GIF: 47 49 46 38
  const isGIF = magic[0] === 0x47 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x38;
  if (isGIF) return 'image/gif';
  // WebP: 52 49 46 46 ... 57 45 42 50
  const isRIFF = magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46;
  if (isRIFF && magic[8] === 0x57 && magic[9] === 0x45 && magic[10] === 0x42 && magic[11] === 0x50) {
    return 'image/webp';
  }
  // MP4: box size ... 66 74 79 70 = 'ftyp' at offset 4
  if (magic[4] === 0x66 && magic[5] === 0x74 && magic[6] === 0x79 && magic[7] === 0x70) {
    return type === 'voice' ? 'audio/mp4' : 'video/mp4';
  }
  // WebM: 1A 45 DF A3
  const isWebM = magic[0] === 0x1A && magic[1] === 0x45 && magic[2] === 0xDF && magic[3] === 0xA3;
  if (isWebM) return type === 'voice' ? 'audio/webm' : 'video/webm';

  if (type === 'voice') return 'audio/webm';
  if (type === 'video') return 'video/mp4';
  return 'image/jpeg';
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

export async function cloudDeleteVaccine(record_id: string): Promise<boolean> {
  try {
    // 后端 vaccines DELETE 从 body 读取 record_id（与通用 apiDelete 的 query 参数方式不同）
    const resp = await fetch(`${WORKER_URL}/api/vaccines`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ record_id }),
    });
    if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`);
    const data = await resp.json();
    return data.code === 0;
  } catch (e) {
    console.warn('云端删除疫苗记录失败:', e);
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

// ========== AI 会话/消息持久化 ==========

export interface ChatSession {
  record_id?: string;
  sessionId: string;          // 业务主键 UUID
  accountName?: string;       // 服务端写入
  accountId?: string;         // 服务端写入
  babyScope: '全部宝宝' | '指定宝宝';
  babyName: string;           // "全部宝宝" 或 具体宝宝名
  babyId?: string;            // scope=全部宝宝 时为空
  title: string;              // 会话标题（首条用户消息前 30 字）
  messageCount: number;
  createdAt: string;          // ISO 时间字符串
  lastMessageAt: string;
  sourcePage: 'AI对话' | '首页分析' | '记录辅助';
  status: '活跃' | '已清空';
}

export interface ChatMessageRecord {
  record_id?: string;
  messageId: string;          // 业务主键 UUID
  sessionId: string;
  accountName?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  status: '成功' | '失败' | '流式中';
  errorMessage?: string;
  sourcePage: 'AI对话' | '首页分析' | '记录辅助';
}

// 解析飞书单选字段（可能是对象 {name} 或字符串）
function parseSingleSelect(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value?.name) return value.name;
  return String(value);
}

function feishuToChatSession(item: any): ChatSession {
  const f = item.fields || {};
  return {
    record_id: item.record_id,
    sessionId: f['会话ID'] || '',
    accountName: f['账号名'] || '',
    accountId: f['账号ID'] || '',
    babyScope: parseSingleSelect(f['宝宝范围']) as ChatSession['babyScope'] || '指定宝宝',
    babyName: f['宝宝名称'] || '',
    babyId: f['宝宝ID'] || '',
    title: f['会话标题'] || '',
    messageCount: Number(f['消息数']) || 0,
    createdAt: typeof f['创建时间'] === 'number' ? new Date(f['创建时间']).toISOString() : (f['创建时间'] || ''),
    lastMessageAt: typeof f['最后消息时间'] === 'number' ? new Date(f['最后消息时间']).toISOString() : (f['最后消息时间'] || ''),
    sourcePage: parseSingleSelect(f['来源页']) as ChatSession['sourcePage'] || 'AI对话',
    status: parseSingleSelect(f['状态']) as ChatSession['status'] || '活跃',
  };
}

function feishuToChatMessage(item: any): ChatMessageRecord {
  const f = item.fields || {};
  return {
    record_id: item.record_id,
    messageId: f['消息ID'] || '',
    sessionId: f['会话ID'] || '',
    accountName: f['账号名'] || '',
    role: parseSingleSelect(f['角色']) as ChatMessageRecord['role'] || 'user',
    content: f['消息内容'] || '',
    createdAt: typeof f['创建时间'] === 'number' ? new Date(f['创建时间']).toISOString() : (f['创建时间'] || ''),
    status: parseSingleSelect(f['状态']) as ChatMessageRecord['status'] || '成功',
    errorMessage: f['错误信息'] || '',
    sourcePage: parseSingleSelect(f['来源页']) as ChatMessageRecord['sourcePage'] || 'AI对话',
  };
}

// 生成 UUID（兼容 crypto.randomUUID 不存在的环境）
function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxxxxxx4xxx'.replace(/[x]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// 拉取当前账号最近 1 条活跃会话
export async function cloudGetActiveChatSession(): Promise<ChatSession | null> {
  try {
    const data = await apiGet('/api/ai-sessions');
    if (data.code !== 0) return null;
    const items = data.data?.items || [];
    if (items.length === 0) return null;
    return feishuToChatSession(items[0]);
  } catch (e) {
    console.warn('云端拉取AI会话失败:', e);
    return null;
  }
}

// 拉取当前账号全部历史会话列表（按最后消息时间倒序）
export async function cloudGetAllChatSessions(): Promise<ChatSession[]> {
  try {
    const data = await apiGet('/api/ai-sessions?all=1');
    if (data.code !== 0) return [];
    const items = data.data?.items || [];
    return items.map(feishuToChatSession);
  } catch (e) {
    console.warn('云端拉取AI会话列表失败:', e);
    return [];
  }
}

// 创建新会话
export async function cloudCreateChatSession(input: {
  babyScope: '全部宝宝' | '指定宝宝';
  babyName: string;
  babyId?: string;
  title: string;
  sourcePage?: 'AI对话' | '首页分析' | '记录辅助';
}): Promise<ChatSession | null> {
  try {
    const sessionId = genId();
    const fields: Record<string, any> = {
      '会话ID': sessionId,
      '宝宝范围': input.babyScope,
      '宝宝名称': input.babyName,
      '会话标题': input.title,
      '来源页': input.sourcePage || 'AI对话',
    };
    if (input.babyId) fields['宝宝ID'] = input.babyId;
    const data = await apiPost('/api/ai-sessions', fields);
    if (data.code !== 0) {
      console.warn('云端创建AI会话失败:', data.msg);
      return null;
    }
    // 返回构造的会话对象（服务端会补充账号信息、时间戳等）
    return {
      sessionId,
      babyScope: input.babyScope,
      babyName: input.babyName,
      babyId: input.babyId,
      title: input.title,
      messageCount: 0,
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      sourcePage: input.sourcePage || 'AI对话',
      status: '活跃',
      record_id: data?.data?.record?.record_id,
    };
  } catch (e) {
    console.warn('云端创建AI会话异常:', e);
    return null;
  }
}

// 删除会话及其所有消息
export async function cloudDeleteChatSession(sessionId?: string): Promise<boolean> {
  try {
    const url = sessionId
      ? `${WORKER_URL}/api/ai-sessions?session_id=${encodeURIComponent(sessionId)}`
      : `${WORKER_URL}/api/ai-sessions`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
    if (resp.status === 401) {
      throw new Error('AUTH_EXPIRED');
    }
    return resp.ok;
  } catch (e) {
    console.warn('云端删除AI会话失败:', e);
    return false;
  }
}

// 拉取某会话的所有消息（按时间升序）
export async function cloudGetChatMessages(sessionId: string): Promise<ChatMessageRecord[]> {
  try {
    const data = await apiGet(`/api/ai-messages?session_id=${encodeURIComponent(sessionId)}`);
    if (data.code !== 0) return [];
    const items = data.data?.items || [];
    return items.map(feishuToChatMessage);
  } catch (e) {
    console.warn('云端拉取AI消息失败:', e);
    return [];
  }
}

// 新增一条消息
export async function cloudCreateChatMessage(input: {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: '成功' | '失败' | '流式中';
  errorMessage?: string;
  sourcePage?: 'AI对话' | '首页分析' | '记录辅助';
}): Promise<ChatMessageRecord | null> {
  try {
    const messageId = genId();
    const now = Date.now();
    const fields: Record<string, any> = {
      '消息ID': messageId,
      '会话ID': input.sessionId,
      '角色': input.role,
      '消息内容': input.content,
      '创建时间': now,
      '状态': input.status || '成功',
      '来源页': input.sourcePage || 'AI对话',
    };
    if (input.errorMessage) fields['错误信息'] = input.errorMessage;
    const data = await apiPost('/api/ai-messages', fields);
    if (data.code !== 0) {
      console.warn('云端写入AI消息失败:', data.msg);
      return null;
    }
    return {
      messageId,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      createdAt: new Date(now).toISOString(),
      status: input.status || '成功',
      errorMessage: input.errorMessage,
      sourcePage: input.sourcePage || 'AI对话',
      record_id: data?.data?.record?.record_id,
    };
  } catch (e) {
    console.warn('云端写入AI消息异常:', e);
    return null;
  }
}
