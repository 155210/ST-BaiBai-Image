import { describe, expect, it, vi } from 'vitest';

const chat = [
  {
    mes: '<think>先想想</think>\n雨下了一整夜，街上空无一人。\n\n她撑着伞站在路灯下，等着迟到的人。\n<bbi_image><tag>1girl, umbrella</tag></bbi_image>\n\n远处传来电车的声音。',
  },
];
vi.mock('@/st/context', () => ({ getContext: () => ({ chat }) }));

import { applyPassageHint, floorPassages, PASSAGE_HINT_PREFIX, passageHint, passageTaskNote } from './passage';

describe('floorPassages', () => {
  it('按 AI 看到的样子切段:去掉思维链和生图 tag,编号 P1 起', () => {
    const list = floorPassages(0);
    expect(list.map(p => p.id)).toEqual(['P1', 'P2', 'P3']);
    expect(list[1].text).toContain('撑着伞');
    expect(list.some(p => p.text.includes('先想想') || p.text.includes('umbrella'))).toBe(false);
  });

  it('楼不存在返回空', () => {
    expect(floorPassages(5)).toEqual([]);
    expect(floorPassages(null)).toEqual([]);
  });
});

describe('passageHint', () => {
  it('写段落编号和一小截原文', () => {
    const line = passageHint([{ id: 'P2', text: '她撑着伞站在路灯下，等着迟到的人。' }]);
    expect(line.startsWith(PASSAGE_HINT_PREFIX)).toBe(true);
    expect(line).toContain('⟦P2⟧');
    expect(line).toContain('撑着伞');
  });

  it('没选返回空串', () => {
    expect(passageHint([])).toBe('');
  });

  it('选得再多也不会撑爆要求上限', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `P${i + 1}`, text: '很长的段落'.repeat(40) }));
    expect(passageHint(many).length).toBeLessThan(250);
  });
});

describe('applyPassageHint', () => {
  it('新的一行放最前,保留用户自己写的要求', () => {
    expect(applyPassageHint('换成全身构图', `${PASSAGE_HINT_PREFIX} A`)).toBe(`${PASSAGE_HINT_PREFIX} A\n换成全身构图`);
  });

  it('再挑一次替换旧行,不叠加', () => {
    const once = applyPassageHint('换成全身构图', `${PASSAGE_HINT_PREFIX} A`);
    expect(applyPassageHint(once, `${PASSAGE_HINT_PREFIX} B`)).toBe(`${PASSAGE_HINT_PREFIX} B\n换成全身构图`);
  });

  it('传空行 = 去掉那句', () => {
    expect(applyPassageHint(`${PASSAGE_HINT_PREFIX} A\n换成全身构图`, '')).toBe('换成全身构图');
  });
});

describe('passageTaskNote', () => {
  it('带上用户的段落要求,并要求恰好 1 张', () => {
    const note = passageTaskNote(`${PASSAGE_HINT_PREFIX} ⟦P2⟧`);
    expect(note).toContain('⟦P2⟧');
    expect(note).toContain('恰好返回 1 项');
  });
});
