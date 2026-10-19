import { afterEach, describe, expect, it, vi } from 'vitest';

import { beginStream, isWatched, REFRESH_MS, streamView, watchStream } from './live';

afterEach(() => {
  vi.useRealTimers();
});

describe('实时输出:收起不刷新,展开节流刷新', () => {
  it('没人展开时片段不进响应式 view', () => {
    vi.useFakeTimers();
    const tap = beginStream('自动 tag(第 1 楼)');
    tap.push('abc');
    vi.advanceTimersByTime(REFRESH_MS * 4);
    expect(isWatched()).toBe(false);
    expect(streamView.text).not.toBe('abc');
    tap.end();
  });

  it('展开后立刻看到已有内容,之后每 0.5 秒才刷新一次', () => {
    vi.useFakeTimers();
    const tap = beginStream('批量写 tag');
    tap.push('第一段');
    const release = watchStream();
    expect(streamView.text).toBe('第一段');
    expect(streamView.running).toBe(true);
    tap.push('第二段');
    expect(streamView.text).toBe('第一段');
    vi.advanceTimersByTime(REFRESH_MS);
    expect(streamView.text).toBe('第一段第二段');
    tap.end();
    expect(streamView.running).toBe(false);
    release();
    expect(isWatched()).toBe(false);
    // 收起后不再更新
    const next = beginStream('下一条');
    next.push('看不到');
    vi.advanceTimersByTime(REFRESH_MS * 3);
    expect(streamView.text).toBe('第一段第二段');
    next.end();
  });

  it('并发时显示最新开始的那条;报错带出原因', () => {
    const release = watchStream();
    const a = beginStream('A');
    const b = beginStream('B');
    a.push('aaa');
    b.push('bbb');
    b.end('超时');
    expect(streamView.source).toBe('B');
    expect(streamView.text).toBe('bbb');
    expect(streamView.error).toBe('超时');
    a.end();
    release();
  });

  it('超长输出只保留结尾', () => {
    const release = watchStream();
    const tap = beginStream('长');
    for (let i = 0; i < 100; i++) tap.push('x'.repeat(1000));
    tap.end();
    expect(streamView.text.length).toBeLessThanOrEqual(20000);
    release();
  });
});

describe('楼层折叠区用的在途登记', () => {
  it('开始/结束各通知一次,新内容不通知;结束后从在途里移除', async () => {
    const { activeStreams, onStreamsChange } = await import('./live');
    const changes = vi.fn();
    const off = onStreamsChange(changes);
    const tap = beginStream('自动 tag(第 3 楼)', { chatId: 'c1', floor: 3 });
    expect(changes).toHaveBeenCalledTimes(1);
    const live = activeStreams().find(item => item.floor === 3);
    expect(live?.chatId).toBe('c1');
    tap.push('abc');
    tap.push('de');
    expect(changes).toHaveBeenCalledTimes(1);
    expect(live?.total).toBe(5);
    tap.end();
    tap.end('重复调用不再通知');
    expect(changes).toHaveBeenCalledTimes(2);
    expect(activeStreams().some(item => item.floor === 3)).toBe(false);
    off();
  });

  it('tailText 只留结尾并注明省略了多少字', async () => {
    const { tailText } = await import('./live');
    expect(tailText({ text: 'abcdef', total: 6 }, 10)).toBe('abcdef');
    expect(tailText({ text: 'abcdef', total: 6 }, 3)).toBe('…（前面还有 3 字）\ndef');
    // text 本身已被截过一次时,省略数按累计字数算
    expect(tailText({ text: 'def', total: 100 }, 10)).toBe('…（前面还有 97 字）\ndef');
  });
});
