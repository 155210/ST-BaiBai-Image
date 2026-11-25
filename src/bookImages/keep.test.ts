import { describe, expect, it } from 'vitest';
import { promptHash } from '@/floor/storage';
import { generatedSlotSeqs, isBookImageTag, keepBookTags, renumberBookSlots } from './keep';

const BOOK1 = '<bbi_image>插图1</bbi_image>';
const BOOK2 = '<bbi_image>插图2</bbi_image>';
const GEN = '<bbi_image>1girl, smile</bbi_image>';

describe('书内插图', () => {
  it('只认「插图N」这种 tag', () => {
    expect(isBookImageTag(BOOK1)).toBe(true);
    expect(isBookImageTag(GEN)).toBe(false);
  });

  it('一起改这层的图只列生成的图，序号保持原样', () => {
    expect(generatedSlotSeqs(['a', BOOK1, 'b', GEN, 'c', BOOK2, GEN].join('\n'))).toEqual([1, 3]);
    expect(generatedSlotSeqs(BOOK1)).toEqual([]);
  });

  it('重新生成后书内插图放回原来那一行后面，新 tag 照常', () => {
    const before = ['第一段', BOOK1, '第二段', GEN, '第三段', BOOK2].join('\n');
    const after = ['第一段', '第二段', '第三段', GEN].join('\n');
    expect(keepBookTags(before, after)).toBe(['第一段', BOOK1, '第二段', '第三段', BOOK2, GEN].join('\n'));
  });

  it('前面那一行找不到时按大概位置放；已有的不重复放', () => {
    const before = ['甲', '乙', BOOK1, '丙', '丁'].join('\n');
    const after = ['A', 'B', 'C', 'D'].join('\n');
    expect(keepBookTags(before, after)).toBe(['A', 'B', BOOK1, 'C', 'D'].join('\n'));
    const done = ['A', BOOK1, 'B'].join('\n');
    expect(keepBookTags(before, done)).toBe(done);
  });

  it('图片记录的序号跟着 tag 的新位置改', () => {
    const mes = [GEN, '正文', BOOK1].join('\n');
    const store = { 0: { [promptHash(BOOK1)]: [{ path: 'a.png', slotSeq: 0, createdAt: 1 }] } } as never;
    expect(renumberBookSlots(mes, store, 0)).toBe(true);
    expect((store as Record<string, Record<string, Array<{ slotSeq: number }>>>)[0][promptHash(BOOK1)][0].slotSeq).toBe(1);
    expect(renumberBookSlots(mes, store, 0)).toBe(false);
  });
});
