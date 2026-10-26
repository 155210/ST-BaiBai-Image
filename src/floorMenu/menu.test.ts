import { describe, expect, it } from 'vitest';

import { menuEntry } from './menu';

describe('🎧 菜单项', () => {
  it('tag 按钮按本楼有没有 tag 换名字', () => {
    expect(menuEntry('bbi-tag-action', '', false, false).label).toBe('生成生图 tag');
    expect(menuEntry('bbi-tag-action', '', true, true)).toMatchObject({ label: '重新生成 tag', running: true });
  });

  it('其它按钮的标题拆成名字和小字说明', () => {
    expect(menuEntry('bbi-passage-gen-action', '再加图（挑段落，可分几组，原来的图不动）', false, true)).toEqual({
      label: '再加图',
      hint: '挑段落，可分几组，原来的图不动',
      running: false,
    });
    expect(menuEntry('bbi-multi-rewrite-action', '一起改这层的图', false, true)).toEqual({ label: '一起改这层的图', hint: '', running: false });
  });
});
