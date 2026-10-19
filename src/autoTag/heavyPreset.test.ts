import { describe, expect, it } from 'vitest';
import type { ChatMsg } from '@/api/client';
import {
  assembleHeavyMessages,
  HEAVY_SLOT_ID,
  heavyPresetUsable,
  heavySlotEntry,
  normalizeHeavyPreset,
  parseSTPreset,
  type HeavyEntry,
} from '@/autoTag/heavyPreset';

const DEFAULT_CHAIN: ChatMsg[] = [
  { role: 'system', content: 'jailbreak' },
  { role: 'system', content: 'contract' },
  { role: 'user', content: 'target' },
];

function entry(over: Partial<HeavyEntry> & { id: string }): HeavyEntry {
  return {
    name: over.id,
    role: 'system',
    content: over.id,
    enabled: true,
    position: 'relative',
    depth: 4,
    order: 100,
    ...over,
  };
}

/** 一份最小的酒馆聊天补全预设:含 main/nsfw/jailbreak、标记条目、深度条目与两份 prompt_order。 */
const ST_PRESET = {
  temperature: 1,
  prompts: [
    { identifier: 'main', name: 'Main Prompt', system_prompt: true, role: 'system', content: '写给{{char}}' },
    { identifier: 'worldInfoBefore', name: 'World Info (before)', system_prompt: true, marker: true },
    { identifier: 'charDescription', name: 'Char Description', system_prompt: true, marker: true },
    { identifier: 'chatHistory', name: 'Chat History', system_prompt: true, marker: true },
    { identifier: 'jailbreak', name: 'Post-History', system_prompt: true, role: 'system', content: '后置' },
    { identifier: 'abc', name: '🎁第一人称文风', role: 'user', content: '第一人称', injection_position: 0 },
    {
      identifier: 'deep',
      name: '深度注入',
      role: 'assistant',
      content: '我明白',
      injection_position: 1,
      injection_depth: 1,
      injection_order: 50,
    },
    { identifier: 'cont', name: '仅续写', role: 'system', content: '续写', injection_trigger: ['continue'] },
    { identifier: 'orphan', name: '不在顺序里', role: 'system', content: 'x', enabled: true },
    { identifier: 'dialogueExamples', name: 'Chat Examples', system_prompt: true, marker: true },
  ],
  prompt_order: [
    { character_id: 100000, order: [{ identifier: 'main', enabled: true }] },
    {
      character_id: 100001,
      order: [
        { identifier: 'main', enabled: true },
        { identifier: 'abc', enabled: true },
        { identifier: 'worldInfoBefore', enabled: true },
        { identifier: 'charDescription', enabled: true },
        { identifier: 'chatHistory', enabled: true },
        { identifier: 'deep', enabled: true },
        { identifier: 'cont', enabled: true },
        { identifier: 'jailbreak', enabled: false },
      ],
    },
  ],
};

describe('parseSTPreset', () => {
  it('列表与酒馆条目列表一致:按全局 prompt_order 排序,聊天记录换成柏宝绘占位,标记条目不导入', () => {
    const { entries, promptCount } = parseSTPreset(ST_PRESET);
    expect(entries.map(e => e.id)).toEqual(['main', 'abc', HEAVY_SLOT_ID, 'deep', 'cont', 'jailbreak']);
    expect(promptCount).toBe(5);
  });

  it('条目库里有、酒馆列表没放的条目收进 extras,一律关闭,标记条目不收', () => {
    const { entries, extras } = parseSTPreset(ST_PRESET);
    expect(extras.map(e => [e.id, e.enabled])).toEqual([['orphan', false]]);
    expect(entries.some(e => e.id === 'orphan')).toBe(false);
  });

  it('保留身份、位置、深度与开关', () => {
    const byId = new Map(parseSTPreset(ST_PRESET).entries.map(e => [e.id, e]));
    expect(byId.get('abc')).toMatchObject({ role: 'user', position: 'relative', enabled: true, name: '🎁第一人称文风' });
    expect(byId.get('deep')).toMatchObject({ role: 'assistant', position: 'depth', depth: 1, order: 50 });
    expect(byId.get('jailbreak')?.enabled).toBe(false);
    // 触发器只含续写:普通生成酒馆也不发
    expect(byId.get('cont')?.enabled).toBe(false);
  });

  it('支持提示词管理器单独导出的格式,无聊天记录标记时占位放末尾', () => {
    const { entries } = parseSTPreset({
      version: 1,
      data: {
        prompts: [{ identifier: 'a', name: 'A', role: 'system', content: 'a' }],
        prompt_order: [{ identifier: 'a', enabled: true }],
      },
    });
    expect(entries.map(e => e.id)).toEqual(['a', HEAVY_SLOT_ID]);
  });

  it('汇报导入统计,读取压缩系统消息开关', () => {
    const parsed = parseSTPreset({ ...ST_PRESET, squash_system_messages: true });
    expect(parsed).toMatchObject({ promptCount: 5, enabledCount: 3, droppedMarkers: 2, hadChatHistory: true, squash: true });
    expect(parseSTPreset(ST_PRESET).squash).toBe(false);
  });

  it('开关只认 prompt_order,不看 prompts[].enabled;聊天记录被关掉也放占位', () => {
    const { entries } = parseSTPreset({
      prompts: [
        { identifier: 'a', role: 'system', content: 'a', enabled: false },
        { identifier: 'chatHistory', marker: true },
      ],
      prompt_order: [
        {
          character_id: 100001,
          order: [
            { identifier: 'a', enabled: true },
            { identifier: 'chatHistory', enabled: false },
          ],
        },
      ],
    });
    expect(entries.map(e => [e.id, e.enabled])).toEqual([
      ['a', true],
      [HEAVY_SLOT_ID, true],
    ]);
  });

  it('没有全局顺序时取条目最多的那份', () => {
    const { entries } = parseSTPreset({
      prompts: [
        { identifier: 'a', content: 'a' },
        { identifier: 'b', content: 'b' },
      ],
      prompt_order: [
        { character_id: 100000, order: [{ identifier: 'a', enabled: true }] },
        {
          character_id: 7,
          order: [
            { identifier: 'b', enabled: true },
            { identifier: 'a', enabled: true },
          ],
        },
      ],
    });
    expect(entries.map(e => e.id)).toEqual(['b', 'a', HEAVY_SLOT_ID]);
  });

  it('没有 prompts 时报错', () => {
    expect(() => parseSTPreset({ temperature: 1 })).toThrow(/prompts/);
    expect(() => parseSTPreset(null)).toThrow();
  });
});

describe('assembleHeavyMessages', () => {
  it('相对条目按列表顺序,占位展开为默认消息链,身份照搬', () => {
    const messages = assembleHeavyMessages(
      [entry({ id: 'main' }), entry({ id: 'u', role: 'user' }), heavySlotEntry(), entry({ id: 'post', role: 'assistant' })],
      DEFAULT_CHAIN,
    );
    expect(messages).toEqual([
      { role: 'system', content: 'main' },
      { role: 'user', content: 'u' },
      ...DEFAULT_CHAIN,
      { role: 'assistant', content: 'post' },
    ]);
  });

  it('关闭的、空内容的条目跳过,宏只展开预设条目', () => {
    const messages = assembleHeavyMessages(
      [entry({ id: 'off', enabled: false }), entry({ id: 'blank', content: '  ' }), entry({ id: 'm', content: '{{char}}' }), heavySlotEntry()],
      [{ role: 'user', content: '{{char}}' }],
      text => text.replaceAll('{{char}}', '小雪'),
    );
    expect(messages).toEqual([
      { role: 'system', content: '小雪' },
      { role: 'user', content: '{{char}}' },
    ]);
  });

  it('深度条目插进默认消息链:0 在末尾,N 在倒数第 N 条之前', () => {
    const messages = assembleHeavyMessages(
      [
        heavySlotEntry(),
        entry({ id: 'd0', position: 'depth', depth: 0, role: 'user' }),
        entry({ id: 'd1', position: 'depth', depth: 1 }),
        entry({ id: 'd9', position: 'depth', depth: 9, role: 'assistant' }),
      ],
      DEFAULT_CHAIN,
    );
    expect(messages.map(m => m.content)).toEqual(['d9', 'jailbreak', 'contract', 'd1', 'target', 'd0']);
    expect(messages[0].role).toBe('assistant');
  });

  it('同深度按 order 从小到大,同 order 同身份合并成一条', () => {
    const messages = assembleHeavyMessages(
      [
        heavySlotEntry(),
        entry({ id: 'late', position: 'depth', depth: 0, order: 200 }),
        entry({ id: 'a', position: 'depth', depth: 0, order: 10 }),
        entry({ id: 'b', position: 'depth', depth: 0, order: 10 }),
      ],
      [{ role: 'user', content: 'target' }],
    );
    expect(messages).toEqual([
      { role: 'user', content: 'target' },
      { role: 'system', content: 'a\nb' },
      { role: 'system', content: 'late' },
    ]);
  });

  it('squash 开着时相邻 system 合并,隔着别的身份不合并', () => {
    const messages = assembleHeavyMessages(
      [entry({ id: 'm' }), heavySlotEntry(), entry({ id: 'post', role: 'user' })],
      DEFAULT_CHAIN,
      undefined,
      true,
    );
    expect(messages).toEqual([
      { role: 'system', content: 'm\n\njailbreak\n\ncontract' },
      { role: 'user', content: 'target' },
      { role: 'user', content: 'post' },
    ]);
    // 原数组不被改写
    expect(DEFAULT_CHAIN[0].content).toBe('jailbreak');
  });

  it('导入的预设整体拼装', () => {
    const { entries } = parseSTPreset(ST_PRESET);
    const messages = assembleHeavyMessages(entries, DEFAULT_CHAIN, t => t.replaceAll('{{char}}', '小雪'));
    expect(messages).toEqual([
      { role: 'system', content: '写给小雪' },
      { role: 'user', content: '第一人称' },
      { role: 'system', content: 'jailbreak' },
      { role: 'system', content: 'contract' },
      { role: 'assistant', content: '我明白' },
      { role: 'user', content: 'target' },
    ]);
  });
});

describe('normalizeHeavyPreset / heavyPresetUsable', () => {
  it('extras 一律关闭、不收占位,与列表合起来 id 去重;老数据没有 extras 时为空', () => {
    const preset = normalizeHeavyPreset({
      entries: [{ id: 'a', content: 'a' }],
      extras: [
        { id: 'x', content: 'x', enabled: true },
        { id: 'a', content: 'dup' },
        { id: HEAVY_SLOT_ID },
      ],
    });
    expect(preset.extras.map(e => [e.id, e.enabled])).toEqual([['x', false]]);
    expect(preset.entries.map(e => e.id)).toEqual(['a', HEAVY_SLOT_ID]);
    expect(normalizeHeavyPreset({ entries: [] }).extras).toEqual([]);
  });

  it('extras 不参与拼装', () => {
    const preset = normalizeHeavyPreset({ entries: [heavySlotEntry()], extras: [entry({ id: 'x' })] });
    expect(heavyPresetUsable({ ...preset, enabled: true })).toBe(false);
    expect(assembleHeavyMessages(preset.entries, DEFAULT_CHAIN)).toEqual(DEFAULT_CHAIN);
  });

  it('空值回落默认:开启、只有占位', () => {
    const preset = normalizeHeavyPreset(undefined);
    expect(preset.enabled).toBe(true);
    expect(preset.entries.map(e => e.id)).toEqual([HEAVY_SLOT_ID]);
    expect(heavyPresetUsable(preset)).toBe(false);
  });

  it('补回缺失的占位、去掉重复 id 与坏条目、修正字段类型', () => {
    const preset = normalizeHeavyPreset({
      enabled: false,
      name: 'p',
      entries: [
        { id: 'a', role: 'bogus', content: 'x', position: 'depth', depth: -3 },
        { id: 'a', content: 'dup' },
        null,
        { content: 'no id' },
      ],
    });
    expect(preset.entries.map(e => e.id)).toEqual(['a', HEAVY_SLOT_ID]);
    expect(preset.entries[0]).toMatchObject({ role: 'system', position: 'depth', depth: 0, enabled: true });
    expect(heavyPresetUsable(preset)).toBe(false);
    expect(heavyPresetUsable({ ...preset, enabled: true })).toBe(true);
  });
});
