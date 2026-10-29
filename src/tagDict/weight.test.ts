import { describe, expect, it } from 'vitest';

import { parseWeight, stepWeight } from '@/tagDict/weight';

describe('tag 权重加减', () => {
  it('认两种写法', () => {
    expect(parseWeight('1.3::two-tone hair::')).toEqual({ tag: 'two-tone hair', weight: 1.3, style: 'nai' });
    expect(parseWeight('(blue eyes:0.8)')).toEqual({ tag: 'blue eyes', weight: 0.8, style: 'sd' });
    expect(parseWeight(' smile ')).toEqual({ tag: 'smile', weight: 1, style: null });
  });

  it('没权重的按渠道写法加,已有的按原写法改', () => {
    expect(stepWeight('two-tone hair', 0.1, 'nai')).toBe('1.1::two-tone hair::');
    expect(stepWeight('two-tone hair', 0.1, 'sd')).toBe('(two-tone hair:1.1)');
    expect(stepWeight('1.2::smile::', 0.1, 'sd')).toBe('1.3::smile::');
    expect(stepWeight('(smile:0.9)', -0.1, 'nai')).toBe('(smile:0.8)');
  });

  it('调回 1 去掉写法,上下限夹住,不认的语法不动', () => {
    expect(stepWeight('1.1::smile::', -0.1, 'nai')).toBe('smile');
    expect(stepWeight('3::smile::', 0.1, 'nai')).toBe('3::smile::');
    expect(stepWeight('0.1::smile::', -0.1, 'nai')).toBe('0.1::smile::');
    expect(stepWeight('artist:foo', 0.1, 'nai')).toBe('1.1::artist:foo::');
    expect(stepWeight('1.2::artist:foo::', 0.1, 'nai')).toBe('1.3::artist:foo::');
    expect(stepWeight('artist:foo', 0.1, 'sd')).toBeNull();
    expect(stepWeight('{smile}', 0.1, 'nai')).toBeNull();
    expect(stepWeight('', 0.1, 'nai')).toBeNull();
  });
});
