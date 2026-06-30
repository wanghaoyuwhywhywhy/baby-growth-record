import { CATEGORIES } from '@/utils/constants';
import { getAuthToken } from '@/lib/auth';

const WORKER_URL = 'https://api.tongxi.xyz';

async function callWorkerAI(action: string, data: Record<string, any>): Promise<string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Auth-Token'] = token;

  const response = await fetch(`${WORKER_URL}/api/ai`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, data }),
  });

  if (!response.ok) {
    throw new Error(`AI 服务请求失败: ${response.status}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }
  return result.content || '';
}

/**
 * 根据记录内容自动判断分类
 */
export async function autoCategory(content: string): Promise<string> {
  const categoryList = CATEGORIES.map((c) => c.key).join('、');
  const result = await callWorkerAI('category', { content, categoryList });
  const matched = CATEGORIES.find((c) => c.key === result || c.label === result);
  return matched?.key || '其他';
}

/**
 * 润色记录内容，使其更规范、更有温度
 */
export async function polishContent(content: string): Promise<string> {
  return callWorkerAI('polish', { content });
}

/**
 * 根据上下文生成记录建议
 */
export async function suggestContent(recentRecords: string[]): Promise<string[]> {
  const result = await callWorkerAI('suggest', { recentRecords: recentRecords.slice(0, 5) });
  return result.split('\n').filter((s) => s.trim()).slice(0, 3);
}

/**
 * AI 综合分析宝宝成长数据
 */
export async function analyzeBaby(baby: Record<string, any>, growthRecords: Record<string, any>[], records: Record<string, any>[]): Promise<string> {
  return callWorkerAI('analyze', { baby, growthRecords, records });
}
