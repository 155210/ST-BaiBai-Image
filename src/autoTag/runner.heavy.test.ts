import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMsg } from '@/api/client';

// 只测重试分层:默认提示词解析失败后改用重型提示词;请求异常不换;重试 0 次只发默认。
const DEFAULT_CHAIN: ChatMsg[] = [{ role: 'user', content: 'default-chain' }];

vi.mock('@/api/client', () => ({
  requestCompletion: vi.fn(),
  requestViaMainApi: vi.fn(),
}));
vi.mock('@/autoTag/prompt', () => ({
  buildAutoTagMessages: vi.fn(async () => DEFAULT_CHAIN),
  autoTagProfile: () => ({ naiCharPrompts: false, nl: false, lockedSize: null }),
}));
vi.mock('@/autoTag/bookMemory', () => ({ readBookMemory: () => null }));
vi.mock('@/state/charTags', async importOriginal => ({
  ...(await importOriginal<typeof import('@/state/charTags')>()),
  charTagsBeforeFloor: () => [],
  lockedCharTagNames: () => new Set<string>(),
}));
vi.mock('@/st/context', async importOriginal => ({
  ...(await importOriginal<typeof import('@/st/context')>()),
  getContext: vi.fn(),
}));

import { requestViaMainApi } from '@/api/client';
import { requestFloorTags } from '@/autoTag/runner';
import { HEAVY_SLOT_ID, heavySlotEntry } from '@/autoTag/heavyPreset';
import { getContext, type STContext } from '@/st/context';
import { settings } from '@/state/settings';

let chatSeq = 0;

function stubContext(): void {
  const chatId = `chat-${++chatSeq}`;
  vi.mocked(getContext).mockReturnValue({
    chat: [
      { is_user: true, mes: '你好', name: 'U' },
      { is_user: false, mes: '她走进教室,阳光洒在窗台上。', name: 'A' },
    ],
    name1: 'U',
    name2: 'A',
    getCurrentChatId: () => chatId,
    substituteParams: (text: string) => text.replaceAll('{{char}}', '小雪'),
  } as unknown as STContext);
}

type Call = { messages: ChatMsg[]; source: string };
const calls: Call[] = [];

/** 每次请求按 outcomes 依次:'bad' = 返回无法解析的文本,'net' = 请求本身抛错。 */
function scriptRequests(outcomes: Array<'bad' | 'net'>): void {
  vi.mocked(requestViaMainApi).mockImplementation(async (messages, opts = {}) => {
    calls.push({ messages, source: opts.source ?? '' });
    const outcome = outcomes[calls.length - 1] ?? 'bad';
    if (outcome === 'net') throw new Error('network down');
    opts.validate?.('not json at all');
    return 'not json at all';
  });
}

const saved = {
  retryCount: settings.autoTag.retryCount,
  heavyPreset: settings.autoTag.heavyPreset,
  enabled: settings.enabled,
};

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  settings.enabled = true;
  settings.autoTag.heavyPreset = {
    enabled: true,
    name: 'p',
    entries: [
      {
        id: 'main',
        name: 'Main',
        role: 'system',
        content: '写给{{char}}',
        enabled: true,
        position: 'relative',
        depth: 4,
        order: 100,
      },
      heavySlotEntry(),
    ],
    squash: false,
  };
  stubContext();
});

afterEach(() => {
  Object.assign(settings.autoTag, { retryCount: saved.retryCount, heavyPreset: saved.heavyPreset });
  settings.enabled = saved.enabled;
  vi.restoreAllMocks();
});

const HEAVY_CHAIN: ChatMsg[] = [{ role: 'system', content: '写给小雪' }, ...DEFAULT_CHAIN];

describe('自动 tag 重试分层', () => {
  it('解析失败后剩余重试改用重型提示词', async () => {
    settings.autoTag.retryCount = 2;
    scriptRequests(['bad', 'bad', 'bad']);
    const outcome = await requestFloorTags(1, { quiet: true });
    expect(outcome.kind).toBe('failed');
    expect(calls.map(c => c.messages)).toEqual([DEFAULT_CHAIN, HEAVY_CHAIN, HEAVY_CHAIN]);
    expect(calls[1].source).toContain('重型预设');
    expect(calls[0].source).not.toContain('重型预设');
  });

  it('重试次数为 0 时只发默认提示词', async () => {
    settings.autoTag.retryCount = 0;
    scriptRequests(['bad']);
    await requestFloorTags(1, { quiet: true });
    expect(calls.map(c => c.messages)).toEqual([DEFAULT_CHAIN]);
  });

  it('请求异常不换成重型,解析失败之后才换', async () => {
    settings.autoTag.retryCount = 2;
    scriptRequests(['net', 'bad', 'bad']);
    await requestFloorTags(1, { quiet: true });
    expect(calls.map(c => c.messages)).toEqual([DEFAULT_CHAIN, DEFAULT_CHAIN, HEAVY_CHAIN]);
  });

  it('重型关闭或没有可用条目时一直用默认', async () => {
    settings.autoTag.retryCount = 1;
    settings.autoTag.heavyPreset.enabled = false;
    scriptRequests(['bad', 'bad']);
    await requestFloorTags(1, { quiet: true });
    expect(calls.map(c => c.messages)).toEqual([DEFAULT_CHAIN, DEFAULT_CHAIN]);

    calls.length = 0;
    stubContext();
    settings.autoTag.heavyPreset = { enabled: true, name: '', entries: [heavySlotEntry()], squash: false };
    expect(settings.autoTag.heavyPreset.entries[0].id).toBe(HEAVY_SLOT_ID);
    await requestFloorTags(1, { quiet: true });
    expect(calls.map(c => c.messages)).toEqual([DEFAULT_CHAIN, DEFAULT_CHAIN]);
  });
});
