import { describe, expect, it } from 'vitest';

import { stepFloor } from './step';

// 0 用户楼,1 剧情,2 用户,3 剧情,4 剧情,5 用户
const story = (f: number) => [1, 3, 4].includes(f);

describe('单楼操作:上一楼 / 下一楼', () => {
  it('跳过不能操作的楼,到隔壁的剧情楼', () => {
    expect(stepFloor(6, 1, 1, story)).toBe(3);
    expect(stepFloor(6, 3, 1, story)).toBe(4);
    expect(stepFloor(6, 4, -1, story)).toBe(3);
    expect(stepFloor(6, 3, -1, story)).toBe(1);
  });

  it('往那边没有剧情楼了:null', () => {
    expect(stepFloor(6, 4, 1, story)).toBeNull();
    expect(stepFloor(6, 1, -1, story)).toBeNull();
  });

  it('没填楼号:下一楼从头找,上一楼从最后找', () => {
    expect(stepFloor(6, NaN, 1, story)).toBe(1);
    expect(stepFloor(6, NaN, -1, story)).toBe(4);
  });

  it('楼号超出范围:往回走能回到最近的剧情楼', () => {
    expect(stepFloor(6, 99, -1, story)).toBe(4);
    expect(stepFloor(6, -5, 1, story)).toBe(1);
  });
});
