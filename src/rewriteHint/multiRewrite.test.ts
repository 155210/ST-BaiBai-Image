import { describe, expect, it } from 'vitest';

import { manySlotTaskNote, normalizeSlotEdits, replaceManySlots, slotSeqs } from './multiRewrite';

const T = (s: string) => `<bbi_image>${s}<size>portrait</size></bbi_image>`;
const text = ['第一段', T('a'), '第二段', T('b'), '第三段', T('c')].join('\n');

describe('一起改几张', () => {
  it('空要求、重复的去掉,按楼内顺序排', () => {
    expect(normalizeSlotEdits([{ seq: 2, hint: ' 全身 ' }, { seq: 0, hint: '' }, { seq: 1, hint: '下雨' }, { seq: 2, hint: '别的' }])).toEqual([
      { seq: 1, hint: '下雨' },
      { seq: 2, hint: '全身' },
    ]);
  });

  it('任务备注写清张数、对应关系与每张的要求', () => {
    const note = manySlotTaskNote(text, [{ seq: 0, hint: '全身' }, { seq: 2, hint: '下雨' }]);
    expect(note).toContain('恰好返回 2 项');
    expect(note).toContain('第 1 项 = 第 1 张，第 2 项 = 第 3 张');
    expect(note).toContain('全身');
    expect(note).toContain('- 第 2 张：b');
  });

  it('原位替换这几张,别的不动', () => {
    const out = replaceManySlots(text, text, [{ seq: 0, hint: 'x' }, { seq: 2, hint: 'y' }], [T('A'), T('C')]);
    expect(out).toBe(['第一段', T('A'), '第二段', T('b'), '第三段', T('C')].join('\n'));
  });

  it('期间被改过或张数对不上:整次放弃', () => {
    const changed = text.replace(T('c'), T('cc'));
    expect(replaceManySlots(changed, text, [{ seq: 2, hint: 'y' }], [T('C')])).toBeNull();
    expect(replaceManySlots(text, text, [{ seq: 0, hint: 'x' }, { seq: 2, hint: 'y' }], [T('A')])).toBeNull();
  });

  it('slotSeqs:单张就是自己那张', () => {
    expect(slotSeqs({ seq: 3 })).toEqual([3]);
    expect(slotSeqs({ seq: 0, many: [{ seq: 0, hint: 'a' }, { seq: 4, hint: 'b' }] })).toEqual([0, 4]);
  });
});
