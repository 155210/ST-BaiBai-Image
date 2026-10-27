import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fixPlanTags, withTagHint } from '@/tagDict/autoTag';
import { createTagDict, hintText, type TagDictData } from '@/tagDict/dict';
import type { ImagePlan } from '@/autoTag/protocol';

const data: TagDictData = {
  tags: [
    ['1girl', '1个女孩', 100, 0],
    ['long hair', '长发', 90, 0],
    ['black hair', '黑发', 80, 0],
    ['blue eyes', '蓝眼', 70, 0],
    ['highres', '高分辨率', 60, 5],
    ['maid', '女仆', 50, 0],
    ['maid headdress', '女仆头饰', 40, 0],
    ['hatsune miku', '初音未来', 30, 4],
    ['some artist', '某画师', 20, 1],
  ],
  alias: { hires: 'highres' },
};
const dict = createTagDict(data);

describe('标签库', () => {
  it('纠正写法:别名、单复数、下划线、大小写,重复去掉', () => {
    const r = dict.fix('1girl, Long_Hair, blue eye, hires, long hair, unknown thing');
    expect(r.text).toBe('1girl, long hair, blue eyes, highres, unknown thing');
    expect(r.changes).toEqual([
      ['Long_Hair', 'long hair'],
      ['blue eye', 'blue eyes'],
      ['hires', 'highres'],
    ]);
  });

  it('带权重、括号、@ 的原样留着;没改动时原串不动', () => {
    const src = '1girl,  (black hair:1.2), @小雪, 1.5::maid::, saber \\(fate\\)';
    expect(dict.fix(src)).toEqual({ text: src, changes: [] });
  });

  it('正文里找中文词,最长匹配、画师不算', () => {
    expect(dict.candidates('她是初音未来，戴着女仆头饰，黑发蓝眼。某画师')).toEqual([
      ['初音未来', 'hatsune miku'],
      ['女仆头饰', 'maid headdress'],
      ['黑发', 'black hair'],
      ['蓝眼', 'blue eyes'],
    ]);
    expect(hintText([['黑发', 'black hair']])).toContain('黑发=black hair');
    expect(hintText([])).toBe('');
  });

  it('联想:中文按开头,英文按前缀和别名', () => {
    expect(dict.suggest('女仆').map(t => t[0])).toEqual(['maid', 'maid headdress']);
    expect(dict.suggest('hair').map(t => t[0])).toEqual(['long hair', 'black hair']);
    expect(dict.suggest('hires')[0][0]).toBe('highres');
  });

  it('参考接在最后一条 user 消息后面', () => {
    const out = withTagHint(
      [
        { role: 'system', content: 's' },
        { role: 'user', content: 'u' },
      ],
      'H',
    );
    expect(out[1].content).toBe('u\n\nH');
    expect(withTagHint([{ role: 'user', content: 'u' }], '')[0].content).toBe('u');
  });

  it('纠正整份写 tag 结果,建档字段也改', () => {
    const plan = {
      images: [
        {
          tag: '1girl, blue eye',
          negative: 'hires',
          characters: [{ name: '小雪', tag: 'Black_Hair', nl: 'x' }],
        },
      ],
      changes: [
        { name: '小雪', field: 'new', value: JSON.stringify({ hair: 'black_hair', eyes: 'blue eye' }) },
        { name: '小雪', field: 'nl', value: 'blue eye girl' },
      ],
    } as unknown as ImagePlan;
    expect(fixPlanTags(dict, plan)).toHaveLength(5);
    expect(plan.images[0].tag).toBe('1girl, blue eyes');
    expect(plan.images[0].negative).toBe('highres');
    expect(plan.images[0].characters[0].tag).toBe('black hair');
    expect(JSON.parse(plan.changes[0].value)).toEqual({ hair: 'black hair', eyes: 'blue eyes' });
    expect(plan.changes[1].value).toBe('blue eye girl');
  });

  it('自带的数据读得进来', () => {
    const real = createTagDict(JSON.parse(readFileSync('dict/tags.json', 'utf8')) as TagDictData);
    expect(real.size).toBeGreaterThan(40000);
    expect(real.canon('hires')).toBe('highres');
    expect(real.candidates('黑发少女').map(x => x[1])).toContain('black hair');
  });
});
