import { CATEGORIES } from '@/utils/constants';

const API_KEY_STORAGE = 'deepseek_api_key';

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callDeepSeek(messages: DeepSeekMessage[], temperature = 0.3): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('请先在设置中配置 DeepSeek API Key');

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens: 200,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} ${err.slice(0, 100)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * 根据记录内容自动判断分类
 */
export async function autoCategory(content: string): Promise<string> {
  const categoryList = CATEGORIES.map((c) => c.key).join('、');
  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: `你是一个宝宝成长记录分类助手。根据用户输入的记录内容，判断属于哪个分类。分类列表：${categoryList}。只返回分类名称，不要其他文字。`,
    },
    { role: 'user', content },
  ];
  const result = await callDeepSeek(messages, 0);
  const matched = CATEGORIES.find((c) => c.key === result || c.label === result);
  return matched?.key || '其他';
}

/**
 * 润色记录内容，使其更规范、更有温度
 */
export async function polishContent(content: string): Promise<string> {
  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: '你是一个宝宝成长记录助手。请帮用户润色记录内容，使其更简洁、温暖、有画面感。保持原意，不要添加虚构内容。直接返回润色后的文字，不要加引号或解释。',
    },
    { role: 'user', content },
  ];
  return callDeepSeek(messages, 0.5);
}

/**
 * 根据上下文生成记录建议
 */
export async function suggestContent(recentRecords: string[]): Promise<string[]> {
  const context = recentRecords.slice(0, 5).join('\n');
  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: '你是一个宝宝成长记录助手。根据用户最近的记录，建议3条今天可能想记录的内容。每条不超过20字，用换行分隔。只返回建议内容，不要编号或解释。',
    },
    { role: 'user', content: `最近记录：\n${context}` },
  ];
  const result = await callDeepSeek(messages, 0.8);
  return result.split('\n').filter((s) => s.trim()).slice(0, 3);
}
