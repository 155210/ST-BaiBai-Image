import { describe, expect, it } from 'vitest';

import { parseFloorRange, pickEveryNth } from '@/batch/range';

describe('parseFloorRange', () => {
  it('treats blank input as the whole chat', () => {
    expect(parseFloorRange('  ', 3)).toEqual([0, 1, 2, 3]);
  });

  it('parses singles, ranges and open-ended ranges, sorted and deduplicated', () => {
    expect(parseFloorRange('8-, 2，0-2 5', 9)).toEqual([0, 1, 2, 5, 8, 9]);
  });

  it('swaps reversed ranges and clips past the last floor', () => {
    expect(parseFloorRange('4-2', 9)).toEqual([2, 3, 4]);
    expect(parseFloorRange('7-9999', 9)).toEqual([7, 8, 9]);
  });

  it('rejects garbage and ranges that start past the end', () => {
    expect(() => parseFloorRange('abc', 9)).toThrow('看不懂');
    expect(() => parseFloorRange('20-30', 9)).toThrow('不存在');
  });

  it('returns nothing for an empty chat', () => {
    expect(parseFloorRange('', -1)).toEqual([]);
  });
});

describe('pickEveryNth', () => {
  it('takes the 1st, N+1th, 2N+1th AI floor', () => {
    expect(pickEveryNth([2, 4, 6, 8, 10, 12, 14], 3)).toEqual([2, 8, 14]);
  });
  it('keeps everything for step 1 or junk', () => {
    expect(pickEveryNth([1, 3], 1)).toEqual([1, 3]);
    expect(pickEveryNth([1, 3], 0)).toEqual([1, 3]);
    expect(pickEveryNth([1, 3], Number.NaN)).toEqual([1, 3]);
  });
});
