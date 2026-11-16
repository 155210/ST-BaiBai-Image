import { describe, expect, it } from 'vitest';

import { mergeFloorOps, newCharsOnly } from './slotNewChars';

const op = (kind: 'new' | 'set', name: string) => ({ op: { kind, name } as never, sourceLine: 0 });

describe('单张重写也收新角色', () => {
  it('只留库里没有的新建,改已有角色的不收', () => {
    const out = newCharsOnly([op('new', '陈曦'), op('new', '张艺'), op('set', '黄'), op('new', ' 陈曦 ')], [{ name: '张艺' }, { name: '黄' }]);
    expect(out.map(i => (i.op as { name: string }).name)).toEqual(['陈曦']);
  });

  it('合进本楼增量:同 swipe 接在后面,换了 swipe 就重来', () => {
    const a = { kind: 'new', name: 'A' } as never;
    const b = { kind: 'new', name: 'B' } as never;
    expect(mergeFloorOps({ swipe: 0, ops: [a] }, 0, [b])).toEqual([a, b]);
    expect(mergeFloorOps({ swipe: 1, ops: [a] }, 0, [b])).toEqual([b]);
    expect(mergeFloorOps(null, 0, [b])).toEqual([b]);
  });
});
