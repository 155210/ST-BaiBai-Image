import { beforeEach, describe, expect, it, vi } from 'vitest';

const chat: Array<Record<string, any>> = [];
vi.mock('@/st/context', () => ({ getContext: () => ({ chat, getCurrentChatId: () => 'c' }) }));

import { consumeAutoGenerate } from '@/floor/autoGenerate';

import { addFocusedTag, dropAddedMark, slotExtraUpdate } from './move';
import { PASSAGE_HINT_PREFIX } from './passage';

const T = (s: string) => `<bbi_image>${s}</bbi_image>`;
const hint = (...ids: string[]) => `${PASSAGE_HINT_PREFIX} ${ids.map(id => `⟦${id}⟧`).join('')} 这部分`;
const at = { chatId: 'c', floor: 0, swipeId: 0 };

beforeEach(() => {
  chat.length = 0;
  chat.push({
    mes: '',
    swipe_id: 0,
    extra: { bbiImage: { '0': { ha: [{ generationId: 'a', slotSeq: 0 }], hb: [{ generationId: 'b', slotSeq: 1 }] } } },
  });
});

describe('再加一张 addFocusedTag', () => {
  const text = ['第一段', T('a'), '第二段', T('b'), '第三段'].join('\n');

  it('插到所选段落后面,原有 tag 不动,后面那张的图片记录序号 +1', () => {
    const out = addFocusedTag(text, at, T('new'), hint('P2'));
    expect(out).toBe(['第一段', T('a'), '第二段', T('new'), T('b'), '第三段'].join('\n'));
    const store = slotExtraUpdate(0).value as any;
    expect(store['0'].ha[0].slotSeq).toBe(0);
    expect(store['0'].hb[0].slotSeq).toBe(2);
    // 出图标记挂在新图的序号上,原来的图不会被重出
    expect(consumeAutoGenerate('c', 0, 0, 0)).toBeFalsy();
    expect(consumeAutoGenerate('c', 0, 0, 1)).toBe('force');
  });

  it('选最后一段:放在楼尾,记录不用动', () => {
    const out = addFocusedTag(text, at, T('new'), hint('P1', 'P3'));
    expect(out).toBe(`${text}\n${T('new')}`);
    expect(slotExtraUpdate(0).value).toBe(chat[0].extra.bbiImage);
    expect(consumeAutoGenerate('c', 0, 0, 2)).toBe('force');
  });

  it('段落对不上:放到楼尾,不丢', () => {
    const out = addFocusedTag(text, at, T('new'), hint('P9'));
    expect(out).toBe(`${text}\n${T('new')}`);
    dropAddedMark();
    expect(consumeAutoGenerate('c', 0, 0, 2)).toBeFalsy();
  });

  it('正文末尾的换行原样保留', () => {
    const out = addFocusedTag(`${text}\n`, at, T('new'), hint('P1'));
    expect(out).toBe(['第一段', T('new'), T('a'), '第二段', T('b'), '第三段', ''].join('\n'));
    dropAddedMark();
  });
});

describe('一次加几张 addFocusedTags', () => {
  const text = ['第一段', T('a'), '第二段', T('b'), '第三段'].join('\n');

  it('两张各插到自己那段后面,原有记录与新图标记按最终序号排', async () => {
    const { addFocusedTags } = await import('./move');
    const out = addFocusedTags(text, at, [
      { tag: T('n3'), passageId: 'P3' },
      { tag: T('n1'), passageId: 'P1' },
    ]);
    expect(out).toBe(['第一段', T('n1'), T('a'), '第二段', T('b'), '第三段', T('n3')].join('\n'));
    const store = slotExtraUpdate(0).value as any;
    expect(store['0'].ha[0].slotSeq).toBe(1);
    expect(store['0'].hb[0].slotSeq).toBe(2);
    expect(consumeAutoGenerate('c', 0, 0, 0)).toBe('force');
    expect(consumeAutoGenerate('c', 0, 0, 3)).toBe('force');
    expect(consumeAutoGenerate('c', 0, 0, 1)).toBeFalsy();
    expect(consumeAutoGenerate('c', 0, 0, 2)).toBeFalsy();
  });

  it('写回失败撤掉全部新标记', async () => {
    const { addFocusedTags } = await import('./move');
    addFocusedTags(text, at, [
      { tag: T('x'), passageId: 'P2' },
      { tag: T('y'), passageId: 'P2' },
    ]);
    dropAddedMark();
    for (let i = 0; i < 4; i++) expect(consumeAutoGenerate('c', 0, 0, i)).toBeFalsy();
  });
});
