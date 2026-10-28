import { describe, expect, it } from 'vitest';

import { nlForSend } from './send';

const input = {
  prompt: '1girl',
  nl: 'A girl by the window.',
  characters: [{ name: 'A', tag: 'girl, red hair', nl: 'Waving.' }],
  seed: 1,
};

describe('生成自然语言关掉时出图不发已有的 nl', () => {
  it('开着原样发', () => {
    expect(nlForSend(true, input)).toBe(input);
  });

  it('关着画面和角色的 nl 都不发，原对象不动', () => {
    const out = nlForSend(false, input);
    expect(out).toEqual({ ...input, nl: '', characters: [{ name: 'A', tag: 'girl, red hair', nl: '' }] });
    expect(input.nl).toBe('A girl by the window.');
    expect(input.characters[0].nl).toBe('Waving.');
  });
});
