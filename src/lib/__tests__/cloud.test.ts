import { describe, it, expect } from 'vitest';
import { parseTextField, extractLinkedIds, getCloudAssetUrl } from '@/lib/cloud';

describe('parseTextField', () => {
  it('空值返回空串', () => {
    expect(parseTextField('')).toBe('');
    expect(parseTextField(null)).toBe('');
  });

  it('字符串原样返回', () => {
    expect(parseTextField('hello')).toBe('hello');
  });

  it('富文本数组拼接 text', () => {
    expect(parseTextField([{ text: 'a' }, { text: 'b' }])).toBe('ab');
    expect(parseTextField([{ text: 'a' }, 'b'])).toBe('ab');
  });

  it('其它类型转字符串', () => {
    expect(parseTextField(123)).toBe('123');
  });
});

describe('extractLinkedIds', () => {
  it('空值返回空数组', () => {
    expect(extractLinkedIds(null)).toEqual([]);
  });

  it('飞书对象数组提取 record_ids', () => {
    expect(extractLinkedIds([{ record_ids: ['r1', 'r2'] }])).toEqual(['r1', 'r2']);
  });

  it('字符串数组原样返回', () => {
    expect(extractLinkedIds(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('单个字符串包成数组', () => {
    expect(extractLinkedIds('x')).toEqual(['x']);
  });
});

describe('getCloudAssetUrl', () => {
  it('生成不含 token 的代理 URL', () => {
    const url = getCloudAssetUrl('rec1', 'ft1', 'photo');
    expect(url).toBe(
      'https://api.tongxi.xyz/api/asset?record_id=rec1&file_token=ft1&type=photo',
    );
    // 不应携带用户 token（仅 file_token 这类资源标识是允许的）
    expect(url).not.toContain('?token=');
    expect(url).not.toContain('&token=');
  });

  it('不带 type 时无 type 参数', () => {
    const url = getCloudAssetUrl('rec1', 'ft1');
    expect(url).toBe('https://api.tongxi.xyz/api/asset?record_id=rec1&file_token=ft1');
  });
});
