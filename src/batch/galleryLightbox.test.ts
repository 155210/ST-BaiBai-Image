import { describe, expect, it } from 'vitest';

import { locate, neighbours } from './galleryLightbox';

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

describe('大图开着时新出的图也翻得到', () => {
  const a = { floor: 3, seq: 0 };
  const b = { floor: 5, seq: 0 };
  const c = { floor: 7, seq: 1 };
  it('「最近出图在前」:新图排到前面,当前这张往后挪,左边多出新图', () => {
    const opened = [a, b];
    const now = [{ ...c }, { ...a }, { ...b }];
    const at = locate(opened, 0, () => now);
    expect(at.index).toBe(1);
    expect(at.list).toBe(now);
    expect(neighbours(at.list.length, at.index).prev).toBe(0);
  });
  it('按楼层和第几张认卡片,不看是不是同一个对象', () => {
    expect(locate([b], 0, () => [{ ...a }, { ...b }]).index).toBe(1);
  });
  it('当前这张被筛掉了:还用打开时的那份', () => {
    const opened = [a, b];
    expect(locate(opened, 1, () => [{ ...a }])).toEqual({ list: opened, index: 1 });
  });
  it('没给 live:原样返回', () => {
    const opened = [a, b];
    expect(locate(opened, 1)).toEqual({ list: opened, index: 1 });
  });
});
