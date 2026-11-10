import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDraft, draftFrom, draftPick, draftStale, readDraft, saveDraft, textMark } from './pickDraft';

const passages = [
  { id: 'P1', text: '甲' },
  { id: 'P2', text: '乙' },
  { id: 'P3', text: '丙' },
];

describe('挑段落保存半截选择', () => {
  beforeEach(() => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    });
  });

  it('存原文，打开时按原文找回编号', () => {
    const draft = draftFrom(false, [['P1', 'P3'], []], '下雨', passages, 1);
    expect(draft.groups).toEqual([['甲', '丙'], []]);
    // 中间插了一段、编号挪了位
    const moved = [{ id: 'P1', text: '新' }, { id: 'P2', text: '甲' }, { id: 'P3', text: '乙' }, { id: 'P4', text: '丙' }];
    expect(draftPick(draft, false, moved)).toEqual({ groups: [['P2', 'P4']], extra: '下雨' });
  });

  it('找不回的段落丢掉；一段都没有且没写要求就当没存', () => {
    const draft = draftFrom(false, [['P2']], '', passages);
    expect(draftPick(draft, false, [{ id: 'P1', text: '别的' }])).toBeUndefined();
    expect(draftPick({ ...draft, extra: '全身' }, false, [])).toEqual({ groups: [[]], extra: '全身' });
  });

  it('「重新生成」和「再加图」各存各的', () => {
    expect(draftPick(draftFrom(true, [['P1']], '', passages), false, passages)).toBeUndefined();
  });

  it('存进浏览器，清掉就没了；坏数据当没存', () => {
    saveDraft('c\u00001', draftFrom(false, [['P1']], '', passages));
    expect(readDraft('c\u00001')?.groups).toEqual([['甲']]);
    clearDraft('c\u00001');
    expect(readDraft('c\u00001')).toBeUndefined();
    localStorage.setItem('bbi-passage-pick-drafts', '{"k":{"regen":1}}');
    expect(readDraft('k')).toBeUndefined();
    localStorage.setItem('bbi-passage-pick-drafts', 'not json');
    expect(readDraft('k')).toBeUndefined();
  });

  it('最多留 30 楼', () => {
    for (let i = 0; i < 32; i++) saveDraft(`k${i}`, draftFrom(false, [['P1']], '', passages));
    expect(readDraft('k0')).toBeUndefined();
    expect(readDraft('k1')).toBeUndefined();
    expect(readDraft('k2')).toBeDefined();
  });

  it('点了生成的存档：正文没变还能接着发，正文变了就作废', () => {
    const draft = { ...draftFrom(false, [['P1']], '要求', passages), sent: textMark('甲\n乙\n丙') };
    saveDraft('k', draft);
    expect(draftStale(readDraft('k'), '甲\n乙\n丙')).toBe(false);
    expect(draftPick(readDraft('k'), false, passages)).toEqual({ groups: [['P1']], extra: '要求' });
    expect(draftStale(readDraft('k'), '甲\n<bbi_image>1girl</bbi_image>\n乙\n丙')).toBe(true);
    // 没点过生成的半截选择不看正文
    expect(draftStale(draftFrom(false, [['P1']], '', passages), '随便')).toBe(false);
    expect(draftStale(undefined, '随便')).toBe(false);
  });
});
