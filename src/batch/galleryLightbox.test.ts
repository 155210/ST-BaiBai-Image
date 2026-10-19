import { describe, expect, it } from 'vitest';

import { neighbours } from './galleryLightbox';

describe('图片浏览大图左右切换:没图的卡片也切到', () => {
  it('中间有左右', () => {
    expect(neighbours(5, 2)).toEqual({ prev: 1, next: 3 });
  });
  it('第一张没有左,最后一张没有右', () => {
    expect(neighbours(5, 0)).toEqual({ prev: undefined, next: 1 });
    expect(neighbours(5, 4)).toEqual({ prev: 3, next: undefined });
  });
  it('只有一张两边都没有', () => {
    expect(neighbours(1, 0)).toEqual({ prev: undefined, next: undefined });
  });
});
