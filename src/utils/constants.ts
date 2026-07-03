export interface Category {
  key: string;
  label: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { key: '饮食', label: '饮食', emoji: '🍼', color: '#FFB347' },
  { key: '睡眠', label: '睡眠', emoji: '😴', color: '#A78BFA' },
  { key: '语言', label: '语言', emoji: '💬', color: '#7BCEFF' },
  { key: '运动', label: '运动', emoji: '🏃', color: '#4ADE80' },
  { key: '学习', label: '学习', emoji: '📖', color: '#60A5FA' },
  { key: '玩耍', label: '玩耍', emoji: '🎮', color: '#F472B6' },
  { key: '健康', label: '健康', emoji: '❤️', color: '#FF7B7B' },
  { key: '其他', label: '其他', emoji: '✨', color: '#8B7D7A' },
];

export const CATEGORY_MAP: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c])
);
