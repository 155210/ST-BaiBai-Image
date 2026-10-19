import { describe, expect, it, vi } from 'vitest';

vi.mock('@/st/context', () => ({ getContext: () => ({ chat: new Array(101) }) }));

import { batchRange, galleryRange, setRangeFrom } from './rangeStore';

describe('批量生成和图片浏览各有自己的范围', () => {
  it('改图片浏览的范围不影响批量生成', () => {
    batchRange.text = '0-10';
    galleryRange.text = '50-60';
    expect(batchRange.text).toBe('0-10');
  });

  it('「从这楼起设为范围」:没在跑时两个都设', () => {
    expect(setRangeFrom(30, false)).toEqual({ text: '30-100', batch: true });
    expect(batchRange.text).toBe('30-100');
    expect(galleryRange.text).toBe('30-100');
  });

  it('批量正在跑时只设图片浏览的', () => {
    batchRange.text = '0-10';
    expect(setRangeFrom(70, true)).toEqual({ text: '70-100', batch: false });
    expect(batchRange.text).toBe('0-10');
    expect(galleryRange.text).toBe('70-100');
  });
});
