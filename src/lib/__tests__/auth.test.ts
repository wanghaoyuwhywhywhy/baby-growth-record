import { describe, it, expect } from 'vitest';
import { sanitizeBabyField, sanitizeBabies } from '@/lib/auth';
import type { Baby } from '@/api/feishu';

describe('sanitizeBabyField', () => {
  it('空值返回空串', () => {
    expect(sanitizeBabyField('')).toBe('');
    expect(sanitizeBabyField(null)).toBe('');
    expect(sanitizeBabyField(undefined)).toBe('');
  });

  it('字符串原样返回', () => {
    expect(sanitizeBabyField('小明')).toBe('小明');
  });

  it('富文本数组拼接 text', () => {
    expect(sanitizeBabyField([{ text: 'ab' }, { text: 'cd' }])).toBe('abcd');
  });

  it('非字符串转为字符串', () => {
    expect(sanitizeBabyField(123)).toBe('123');
  });
});

describe('sanitizeBabies', () => {
  it('空值返回空数组', () => {
    expect(sanitizeBabies(null as unknown as unknown[])).toEqual([]);
    expect(sanitizeBabies(undefined as unknown as unknown[])).toEqual([]);
  });

  it('清洗字段并保留其余属性', () => {
    const input: unknown[] = [
      { record_id: '1', 宝宝姓名: '小明', 性别: '男', 备注: ['好'] },
    ];
    const out = sanitizeBabies(input);
    const baby = out[0] as Baby;
    expect(baby.record_id).toBe('1');
    expect(baby.宝宝姓名).toBe('小明');
    expect(baby.性别).toBe('男');
    expect(baby.备注).toBe('好');
  });
});
