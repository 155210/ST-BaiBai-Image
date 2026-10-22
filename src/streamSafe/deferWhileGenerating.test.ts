import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyMessageText } from '@/st/messageEdit';

import { flush, isGenerating, pendingCount } from './deferWhileGenerating';

let stopDisplay = 'none';

function install(context: Record<string, unknown>): void {
  vi.stubGlobal('window', { SillyTavern: { getContext: () => context } });
  vi.stubGlobal('document', {
    querySelector: vi.fn(() => null),
    getElementById: (id: string) => (id === 'mes_stop' ? { style: { display: stopDisplay } } : null),
  });
  vi.stubGlobal('getComputedStyle', (el: { style: { display: string } }) => ({ display: el.style.display }));
}

function makeContext(chatId = 'chat-a') {
  const message = { name: 'Char', is_user: false, is_system: false, mes: '原文', swipes: ['原文'], swipe_id: 0 };
  const emit = vi.fn(async () => undefined);
  const context = {
    chat: [message],
    getCurrentChatId: () => chatId,
    saveChat: vi.fn(async () => undefined),
    eventSource: { emit },
    eventTypes: { MESSAGE_EDITED: 'edited', MESSAGE_UPDATED: 'updated' },
  };
  return { context, emit, message };
}

afterEach(async () => {
  stopDisplay = 'none';
  await flush();
  vi.unstubAllGlobals();
});

describe('酒馆出字时推迟楼层更新通知', () => {
  it('停止按钮亮着就算在生成', () => {
    const { context } = makeContext();
    install(context);
    expect(isGenerating()).toBe(false);
    stopDisplay = 'flex';
    expect(isGenerating()).toBe(true);
  });

  it('没在生成:照常立刻发 MESSAGE_EDITED / MESSAGE_UPDATED', async () => {
    const { context, emit } = makeContext();
    install(context);
    await applyMessageText(0, t => `${t}!`, 'chat-a', 0);
    expect(emit.mock.calls).toEqual([['edited', 0], ['updated', 0]]);
    expect(pendingCount()).toBe(0);
  });

  it('正在生成:正文照常存盘,通知等输出完按原顺序补发', async () => {
    const { context, emit, message } = makeContext();
    install(context);
    stopDisplay = 'flex';
    await expect(applyMessageText(0, t => `${t}!`, 'chat-a', 0)).resolves.toBe('saved');
    expect(message.mes).toBe('原文!');
    expect(context.saveChat).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(2);

    await flush(); // 还在生成:不发
    expect(emit).not.toHaveBeenCalled();

    stopDisplay = 'none';
    await flush();
    expect(emit.mock.calls).toEqual([['edited', 0], ['updated', 0]]);
    expect(pendingCount()).toBe(0);
  });

  it('输出完时聊天已经换了:不补发', async () => {
    const a = makeContext('chat-a');
    install(a.context);
    stopDisplay = 'flex';
    await applyMessageText(0, t => `${t}!`, 'chat-a', 0);
    const b = makeContext('chat-b');
    install(b.context);
    stopDisplay = 'none';
    await flush();
    expect(a.emit).not.toHaveBeenCalled();
    expect(b.emit).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(0);
  });
});
