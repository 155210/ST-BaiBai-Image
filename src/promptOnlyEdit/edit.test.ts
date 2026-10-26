import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({ requestCompletion: vi.fn(), requestViaMainApi: vi.fn() }));
vi.mock('@/state/settings', () => ({ getTagGenChannel: () => null }));

import { parsePromptOnlyReply, promptOnlyMessages } from './edit';

const original = {
  tag: '1girl, red hair',
  nl: '',
  negative: '',
  characters: [{ name: 'Alice', tag: 'red hair', nl: '' }],
  size: 'portrait' as const,
};

describe('只改提示词（不发正文）', () => {
  it('只发提示词和要求', () => {
    const messages = promptOnlyMessages(original, ' 改成蓝头发 ');
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain('"tag": "1girl, red hair"');
    expect(messages[1].content).toContain('修改要求:\n改成蓝头发');
  });

  it('读出改好的提示词，代码块和思考过程都能跳过', () => {
    const raw = '<think>想想</think>```json\n{"tag":"1girl, blue hair","nl":"","negative":"","characters":[{"name":"Alice","tag":"blue hair","nl":""}],"size":"landscape"}\n```';
    expect(parsePromptOnlyReply(raw, original)).toEqual({
      tag: '1girl, blue hair',
      nl: '',
      negative: '',
      characters: [{ name: 'Alice', tag: 'blue hair', nl: '' }],
      size: 'landscape',
    });
  });

  it('缺的字段沿用原来的', () => {
    expect(parsePromptOnlyReply('{"tag":"1girl, smile"}', original)).toEqual({ ...original, tag: '1girl, smile' });
  });

  it('格式不对、tag 为空、夹了标签都报错', () => {
    expect(() => parsePromptOnlyReply('好的', original)).toThrow('没有返回');
    expect(() => parsePromptOnlyReply('{bad}', original)).toThrow('格式不对');
    expect(() => parsePromptOnlyReply('{"tag":""}', original)).toThrow('空的');
    expect(() => parsePromptOnlyReply('{"tag":"<nl>x</nl>"}', original)).toThrow('标签');
  });
});
