import { describe, expect, it } from 'vitest';

import { buildEntryTag, emptyCharFields } from '@/state/charTags';

import { splitBust } from './split';

const f = (body: string, bust = '') => ({ ...emptyCharFields(), sex: '1girl', hair: 'long hair', body, bust });

describe('体型里的胸部词挪到「胸部」', () => {
  it('挪过去,拼出的 tag 不变', () => {
    const before = f('petite, small breasts');
    const after = splitBust(before);
    expect(after).toMatchObject({ body: 'petite', bust: 'small breasts' });
    expect(buildEntryTag({ fields: after, raw: '' })).toBe(buildEntryTag({ fields: before, raw: '' }));
  });

  it('胸部已经填了:以胸部为准,体型里重复的去掉', () => {
    expect(splitBust(f('slim, large breasts', 'medium breasts'))).toMatchObject({ body: 'slim', bust: 'medium breasts' });
  });

  it('体型里没有胸部词的原样不动', () => {
    const fields = f('petite, tall');
    expect(splitBust(fields)).toBe(fields);
  });

  it('只认整词,不误伤 breasts 之外的写法', () => {
    expect(splitBust(f('breast curtain, flat chest'))).toMatchObject({ body: 'breast curtain', bust: 'flat chest' });
  });
});
