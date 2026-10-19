import { describe, expect, it } from 'vitest';

import { searchableText, searchNames, splitNames, stripTagList } from '@/batch/search';
import type { STMessage } from '@/st/context';

const ai = (mes: string) => ({ mes, is_user: false }) as STMessage;
const user = (mes: string) => ({ mes, is_user: true }) as STMessage;
const STRIP = stripTagList([]);

describe('splitNames', () => {
  it('splits on commas and keeps spaces inside English names', () => {
    expect(splitNames('Alice Smith, 小明，小红、小明')).toEqual(['Alice Smith', '小明', '小红']);
  });
  it('splits on spaces when there is no comma', () => {
    expect(splitNames('  小明  小红 ')).toEqual(['小明', '小红']);
    expect(splitNames('')).toEqual([]);
  });
});

describe('stripTagList', () => {
  it('merges built-in, plugin and extra tags without brackets or duplicates', () => {
    const list = stripTagList(['snow'], ['<status>', 'think']);
    expect(list).toContain('think');
    expect(list).toContain('snow');
    expect(list).toContain('status');
    expect(list.filter(tag => tag === 'think')).toHaveLength(1);
  });
});

describe('searchableText', () => {
  it('drops image tags, comments, thinking and excluded blocks', () => {
    const mes =
      '<think>小明在想</think>正文里有小红<bbi_image>小明</bbi_image><!-- 小明 --><status>小明</status>';
    const text = searchableText(mes, stripTagList([], ['status']));
    expect(text).toContain('小红');
    expect(text).not.toContain('小明');
  });
  it('treats text before a lone closing think tag as thinking', () => {
    expect(searchableText('小明在想</think>正文', STRIP)).toBe('正文');
  });
  it('drops everything after an unclosed think tag', () => {
    expect(searchableText('正文<thinking>小明', STRIP)).toBe('正文');
  });
  it('does not cut the story for a lone custom tag', () => {
    expect(searchableText('<status>正文小明', stripTagList([], ['status']))).toContain('小明');
  });
});

describe('searchNames', () => {
  const chat = [
    user('小明你好'),
    ai('小红走进来'),
    ai('小明和小红'),
    ai('<think>小明</think>只有旁白'),
    ai('ALICE waved'),
  ];

  it('lists floors per name, sorted by first appearance, case-insensitive', () => {
    const result = searchNames(chat, ['小明', 'alice', '小红', '没这人'], { withUser: false, stripTags: STRIP });
    expect(result.rows).toEqual([
      { name: '小红', floors: [1, 2] },
      { name: '小明', floors: [2] },
      { name: 'alice', floors: [4] },
      { name: '没这人', floors: [] },
    ]);
    expect(result.together).toEqual([]);
  });

  it('finds floors where all names appear together', () => {
    expect(searchNames(chat, ['小明', '小红'], { withUser: false, stripTags: STRIP }).together).toEqual([2]);
  });

  it('searches user floors only when asked', () => {
    expect(searchNames(chat, ['小明'], { withUser: true, stripTags: STRIP }).rows[0].floors).toEqual([0, 2]);
  });
});
