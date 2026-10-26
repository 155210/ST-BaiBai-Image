import { describe, expect, it } from 'vitest';

import { slotPositionNote, withSlotPositions } from './slotPosition';

const tag = (t: string) => `<bbi_image>${t}</bbi_image>`;
const text = ['第一段。', tag('a'), '第二段。', '第三段。', tag('b'), '第四段。', tag('c')].join('\n');

describe('slotPositionNote', () => {
  it('报出每张图在哪段之后,并给出要改那几张的 position', () => {
    const note = slotPositionNote(text, [0, 2], []);
    expect(note).toContain('第 1 项填 P1，第 2 项填 P4');
    expect(note).toContain('第 1 张：P1 之后；第 2 张：P3 之后；第 3 张：P4 之后');
  });

  it('单张重写', () => {
    expect(slotPositionNote(text, [1], [])).toContain('第 1 项填 P3');
  });

  it('楼头的图记成正文开头,position 退回 P1', () => {
    const note = slotPositionNote([tag('x'), '只有一段。'].join('\n'), [0], []);
    expect(note).toContain('第 1 张：正文开头');
    expect(note).toContain('第 1 项填 P1');
  });

  it('没有图就不加', () => {
    expect(withSlotPositions('备注', '纯正文。', [0], [])).toBe('备注');
  });
});
