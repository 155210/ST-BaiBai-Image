import { describe, expect, it, vi } from 'vitest';

vi.mock('@/autoTag/runner', () => ({ requestFocusedTags: vi.fn() }));
vi.mock('@/generate', () => ({ backendStatus: () => ({ configured: true }) }));

import { restorablePick } from './floorPassageGen';

const last = { regen: false, groups: [['P1', 'P2'], ['P5']], extra: '雨天', text: '原文' };

describe('失败后带回上次挑的段落', () => {
  it('正文没变就带回分组和要求', () => {
    expect(restorablePick(last, '原文', false, ['P1', 'P2', 'P3', 'P5'])).toEqual({ groups: [['P1', 'P2'], ['P5']], extra: '雨天' });
  });

  it('写成了(正文变了)就不带', () => {
    expect(restorablePick(last, '原文\n<bbi_image>x</bbi_image>', false, ['P1', 'P2', 'P5'])).toBeUndefined();
  });

  it('重新生成和再加图各记各的', () => {
    expect(restorablePick(last, '原文', true, ['P1', 'P2', 'P5'])).toBeUndefined();
  });

  it('段落没了就丢掉,整组都没了就不带', () => {
    expect(restorablePick(last, '原文', false, ['P1'])).toEqual({ groups: [['P1']], extra: '雨天' });
    expect(restorablePick(last, '原文', false, ['P9'])).toBeUndefined();
  });
});
