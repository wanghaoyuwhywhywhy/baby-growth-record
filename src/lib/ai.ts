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

/**
 * AI 咨询流式对话
 * @param data 包含messages、baby、growthRecords、records、vaccines
 * @param onChunk 流式回调，每收到一段文本就调用
 * @param signal AbortSignal，用于取消请求
 */
export async function chatStream(
  data: {
    messages: { role: string; content: string }[];
    baby: Record<string, any>;
    growthRecords: Record<string, any>[];
    records: Record<string, any>[];
    vaccines: Record<string, any>[];
  },
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Auth-Token'] = token;

  const response = await fetch(`${WORKER_URL}/api/ai`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'chat', data }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`AI 服务请求失败: ${response.status}`);
  }

  // 解析 SSE 流
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留未完成的行

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') return;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch {
        // 跳过无法解析的行
      }
    }
  }
}
