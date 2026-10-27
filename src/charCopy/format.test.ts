import { describe, expect, it } from 'vitest';

import { emptyCharFields } from '@/state/charTags';

import { formatCharForCopy, parseCharPaste } from './format';

const alice = {
  name: '爱丽丝',
  fields: { ...emptyCharFields(), sex: '1girl', hair: 'long black hair', eyes: 'red eyes', bust: 'small breasts' },
  raw: '',
  nl: 'A petite girl with long black hair and red eyes.',
};

describe('复制外貌', () => {
  it('每栏一行,空栏写「无」,带自然语言', () => {
    const text = formatCharForCopy(alice);
    expect(text).toContain('【角色】爱丽丝');
    expect(text).toContain('【头发】long black hair');
    expect(text).toContain('【肤色】无');
    expect(text).toContain('【自然语言外貌】A petite girl');
    expect(text).not.toContain('整串');
  });

  it('整串模式只给整串和自然语言', () => {
    const text = formatCharForCopy({ ...alice, fields: emptyCharFields(), raw: '1girl, blue hair' });
    expect(text).toContain('【整串 tag】1girl, blue hair');
    expect(text).not.toContain('【头发】');
  });

  it('原样贴回来,内容一样', () => {
    const { values, name } = parseCharPaste(formatCharForCopy(alice));
    expect(name).toBe('爱丽丝');
    expect(values).toMatchObject({ ...alice.fields, nl: alice.nl });
  });
});

describe('粘贴回填:AI 改过格式也认', () => {
  it('加粗、冒号、列表、英文逗号以外的分隔', () => {
    const { values } = parseCharPaste(
      [
        '好的，根据图片我做了如下修改：',
        '',
        '- **头发**：long black hair，hair ribbon、 bangs',
        '- **眼睛:** blue eyes',
        '* 胸部（罩杯）: medium breasts',
        '**肤色**：无',
      ].join('\n'),
    );
    expect(values).toEqual({
      hair: 'long black hair, hair ribbon, bangs',
      eyes: 'blue eyes',
      bust: 'medium breasts',
      skin: '',
    });
  });

  it('没写到的栏不出现(不动原值)', () => {
    const { values } = parseCharPaste('【眼睛】blue eyes');
    expect(Object.keys(values)).toEqual(['eyes']);
  });

  it('代码块、括号换成方括号、「原来 → 现在」', () => {
    const { values } = parseCharPaste(
      ['```', '[头发] brown hair → long black hair', '[体型] petite', '```'].join('\n'),
    );
    expect(values).toEqual({ hair: 'long black hair', body: 'petite' });
  });

  it('表格', () => {
    const { values } = parseCharPaste(
      ['| 栏目 | 内容 |', '| --- | --- |', '| 性别 | 1girl |', '| 标志特征 | mole under eye |'].join('\n'),
    );
    expect(values).toEqual({ sex: '1girl', extra: 'mole under eye' });
  });

  it('自然语言外貌跨行;后面空行再跟说明不混进来', () => {
    const { values } = parseCharPaste(
      ['【自然语言外貌】', 'A slender girl with long black hair,', 'red eyes and pale skin.', '', '以上是修改后的结果。'].join('\n'),
    );
    expect(values.nl).toBe('A slender girl with long black hair, red eyes and pale skin.');
  });

  it('tag 栏换行续写;不认识的栏目到此为止', () => {
    const { values } = parseCharPaste(
      ['【固定着装】school uniform,', 'black thighhighs', '【修改说明】把发色改了', '随便什么'].join('\n'),
    );
    expect(values).toEqual({ outfit: 'school uniform, black thighhighs' });
  });

  it('英文栏目名和「整串 tag」', () => {
    const { values } = parseCharPaste(['Hair: silver hair', 'Natural language: A tall woman.', '整串 tag：1girl, solo'].join('\n'));
    expect(values).toEqual({ hair: 'silver hair', nl: 'A tall woman.', raw: '1girl, solo' });
  });

  it('什么都认不出来', () => {
    expect(parseCharPaste('这张图看起来很好看').values).toEqual({});
  });
});
