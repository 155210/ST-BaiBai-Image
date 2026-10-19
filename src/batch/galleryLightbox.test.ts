import { describe, expect, it } from 'vitest';

import { imageIndexes } from './galleryLightbox';

describe('图片浏览大图左右切换:只在有图的卡片之间跳', () => {
  it('跳过没图的卡片', () => {
    const list = [0, 1, 2, 3, 4].map(floor => ({ floor, seq: 0 }));
    expect(imageIndexes(list, slot => slot.floor !== 1 && slot.floor !== 3)).toEqual([0, 2, 4]);
  });
  it('全没图是空的', () => {
    expect(imageIndexes([{ floor: 0, seq: 0 }], () => false)).toEqual([]);
  });
});
