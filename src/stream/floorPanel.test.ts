import { describe, expect, it, vi } from 'vitest';

vi.mock('@/st/context', () => ({ getContext: () => null }));
vi.mock('@/floor/chatObserver', () => ({ onChatMutation: () => () => {} }));

import { panelMeta } from './floorPanel';

describe('楼层折叠区状态行', () => {
  it('还没出字时显示等了几秒', () => {
    expect(panelMeta({ total: 0, lastAt: 1_000 }, 8_500)).toBe('等待第一段内容… 7 秒');
  });

  it('出字后显示字数,停顿 3 秒以上才提示没有新内容', () => {
    expect(panelMeta({ total: 120, lastAt: 1_000 }, 2_000)).toBe('已收到 120 字');
    expect(panelMeta({ total: 120, lastAt: 1_000 }, 13_000)).toBe('已收到 120 字 · 12 秒没有新内容');
  });
});

describe('楼层折叠区写完后', () => {
  it('显示已结束和总字数,出错带原因', () => {
    expect(panelMeta({ total: 120, lastAt: 0, done: true }, 99_000)).toBe('已结束 · 共 120 字');
    expect(panelMeta({ total: 5, lastAt: 0, done: true, error: '已中断' }, 99_000)).toBe('已中断 · 共 5 字');
  });
});
