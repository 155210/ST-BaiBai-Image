import { describe, expect, it, vi } from 'vitest';

vi.mock('@/st/context', () => ({ getContext: () => ({ chat: [] }) }));

import { moveTagAfterPassage, passageLine, pickedPassageIds, pinFocusPosition, remapStore, shiftedSeq } from './move';
import { PASSAGE_HINT_PREFIX } from './passage';

const T = (s: string) => `<bbi_image>${s}</bbi_image>`;

describe('pickedPassageIds', () => {
  it('只读「这张图只画正文」那一行', () => {
    expect(pickedPassageIds(`${PASSAGE_HINT_PREFIX} ⟦P2⟧⟦P4⟧ 这部分\n换成⟦P9⟧`)).toEqual(['P2', 'P4']);
    expect(pickedPassageIds('换成全身构图')).toEqual([]);
  });
});

describe('passageLine', () => {
  it('编号按去掉 tag 后的段落算,行号对回带 tag 的正文', () => {
    const text = ['第一段', T('a'), '第二段', '第三段'].join('\n');
    expect(passageLine(text, 'P2', [])).toBe(2);
    expect(passageLine(text, 'P3', [])).toBe(3);
  });
});

describe('moveTagAfterPassage', () => {
  const text = ['第一段', T('a'), '第二段', T('b'), '第三段'].join('\n');

  it('第 1 张挪到第三段后面:变成最后一张', () => {
    const r = moveTagAfterPassage(text, 0, T('new'), 'P3', [])!;
    expect(r.text).toBe(['第一段', '第二段', T('b'), '第三段', T('new')].join('\n'));
    expect(r.seq).toBe(1);
  });

  it('第 2 张挪到第一段后面:变成第一张', () => {
    const r = moveTagAfterPassage(text, 1, T('new'), 'P1', [])!;
    expect(r.text).toBe(['第一段', T('new'), T('a'), '第二段', '第三段'].join('\n'));
    expect(r.seq).toBe(0);
  });

  it('挑的就是原来那段:位置不变', () => {
    const r = moveTagAfterPassage(text, 0, T('new'), 'P1', [])!;
    expect(r.text).toBe(['第一段', T('new'), '第二段', T('b'), '第三段'].join('\n'));
    expect(r.seq).toBe(0);
  });

  it('段落编号不存在返回 null', () => {
    expect(moveTagAfterPassage(text, 0, T('new'), 'P9', [])).toBeNull();
  });
});

describe('shiftedSeq / remapStore', () => {
  it('从 0 挪到 2:原 1、2 各前移一位', () => {
    expect([0, 1, 2, 3].map(i => shiftedSeq(i, 0, 2))).toEqual([2, 0, 1, 3]);
  });

  it('从 2 挪到 0:原 0、1 各后移一位', () => {
    expect([0, 1, 2, 3].map(i => shiftedSeq(i, 2, 0))).toEqual([1, 2, 0, 3]);
  });

  it('只改当前 swipe 的记录,其它 swipe 原样;没 slotSeq 的旧记录按 0 算', () => {
    const e = (seq?: number) => ({ generationId: 'g', path: 'p', prompt: '', seed: null, status: 'ready' as const, createdAt: 1, slotSeq: seq });
    const store = { '0': { h1: [e(), e(1)] }, '1': { h2: [e(0)] } };
    const next = remapStore(store, 0, 0, 1)!;
    expect(next['0'].h1.map(x => x.slotSeq)).toEqual([1, 0]);
    expect(next['1']).toBe(store['1']);
    expect(store['0'].h1[0].slotSeq).toBeUndefined();
  });
});

describe('pinFocusPosition', () => {
  it('不管模型放哪,都钉到所选最后一段', () => {
    const images = [{ position: 'P1', sourceLine: 0 }];
    pinFocusPosition(images, [{ id: 'P1', sourceLine: 0 }, { id: 'P2', sourceLine: 2 }, { id: 'P3', sourceLine: 4 }], `${PASSAGE_HINT_PREFIX} ⟦P2⟧⟦P3⟧ 这部分`);
    expect(images[0]).toEqual({ position: 'P3', sourceLine: 4 });
  });
});

describe('slotExtraUpdate', () => {
  it('value 多读几次结果一样(applyMessageText 先判 undefined 再赋值)', async () => {
    const { slotExtraUpdate } = await import('./move');
    const update = slotExtraUpdate(0);
    expect(update.value).toBe(update.value);
  });
});
