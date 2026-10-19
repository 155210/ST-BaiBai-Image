import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiChannel } from '@/state/settings';
import { requestCompletion } from './client';

/** fork:流式请求的「无响应超时」与实时输出。作者测试在 client.test.ts,这里单独放,合并时不冲突。 */

vi.mock('@/state/history', () => ({
  FOLLOW_MAIN_API: '跟随主 API',
  beginLlm: () => 1,
  finishLlm: () => undefined,
  failLlm: () => undefined,
  patchLlmTokens: () => undefined,
  safeHistory: (fn: () => unknown) => {
    try {
      return fn();
    } catch {
      return null;
    }
  },
}));

const live = vi.hoisted(() => ({ pieces: [] as string[], ends: [] as string[], metas: [] as unknown[] }));
vi.mock('@/stream/live', () => ({
  beginStream: (_source: string, meta: unknown) => (live.metas.push(meta), {
    push: (piece: string) => live.pieces.push(piece),
    end: (error = '') => live.ends.push(error),
  }),
}));

vi.mock('@/st/context', () => ({
  getContext: () => ({ getRequestHeaders: () => ({}), getCurrentChatId: () => 'chat-1' }),
}));

const channel: ApiChannel = {
  id: 'ch1',
  name: '测试渠道',
  url: 'https://api.example.com',
  key: 'k',
  model: 'm',
  temperature: 1,
  maxTokens: 1024,
  timeoutSec: 1,
  stream: true,
  excludeParams: [],
  reasoningEffort: '',
};
const messages = [{ role: 'user' as const, content: 'hi' }];

/** 每隔 gaps[i] 毫秒吐一块 SSE;跟真 fetch 一样,signal 中止时读流报错。 */
function slowSse(pieces: string[], gaps: number[], signal?: AbortSignal | null): Response {
  const enc = new TextEncoder();
  let i = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
      async pull(controller) {
        if (signal?.aborted) return;
        if (i >= pieces.length) {
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, gaps[i]));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: pieces[i] } }] })}\n\n`));
        i++;
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

afterEach(() => {
  vi.useRealTimers();
  live.pieces.length = 0;
  live.ends.length = 0;
  live.metas.length = 0;
});

describe('流式:按「多少秒没有新内容」算超时', () => {
  it('总时长超过超时,但一直有新内容 → 不掐断', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => slowSse(['a', 'b', 'c', 'd', 'e'], [700, 700, 700, 700, 700], init.signal)));
    const done = requestCompletion(channel, messages, { source: '测试' });
    await vi.advanceTimersByTimeAsync(4000);
    await expect(done).resolves.toBe('abcde');
    expect(live.pieces.join('')).toBe('abcde');
    expect(live.ends).toEqual(['']);
  });

  it('中途停住超过超时 → 报「没有新内容」', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => slowSse(['a', 'b'], [300, 5000], init.signal)));
    const done = requestCompletion(channel, messages, { source: '测试' });
    const check = expect(done).rejects.toThrow('1秒没有新内容');
    await vi.advanceTimersByTimeAsync(6000);
    await check;
    expect(live.ends.length).toBe(1);
    expect(live.ends[0]).not.toBe('');
  });

  it('非流式仍按总时长算', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ),
    );
    const done = requestCompletion({ ...channel, stream: false }, messages);
    const check = expect(done).rejects.toThrow('超时(>1秒)');
    await vi.advanceTimersByTimeAsync(1500);
    await check;
  });
});

/** 按给定间隔吐出原样文本块(可以是心跳、没换行的结尾等)。 */
function rawSse(chunks: string[], gaps: number[], signal?: AbortSignal | null): Response {
  const enc = new TextEncoder();
  let i = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
      async pull(controller) {
        if (signal?.aborted) return;
        if (i >= chunks.length) {
          controller.close();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, gaps[i]));
        controller.enqueue(enc.encode(chunks[i]));
        i++;
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;

describe('流式:细节', () => {
  it('心跳行和空 delta 不算新内容,不给超时续命', async () => {
    vi.useFakeTimers();
    const beats = [`${delta('a')}\n\n`, ...Array.from({ length: 8 }, (_, k) => (k % 2 ? ': keep-alive\n\n' : 'data: {"choices":[{"delta":{}}]}\n\n'))];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => rawSse(beats, [100, ...beats.slice(1).map(() => 400)], init.signal)));
    const done = requestCompletion(channel, messages, { source: '测试' });
    const check = expect(done).rejects.toThrow('1秒没有新内容');
    await vi.advanceTimersByTimeAsync(5000);
    await check;
  });

  it('最后一行没有换行也能读到', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => rawSse([`${delta('前半')}\n`, delta('后半')], [10, 10], init.signal)));
    const done = requestCompletion(channel, messages, { source: '测试' });
    await vi.advanceTimersByTimeAsync(100);
    await expect(done).resolves.toBe('前半后半');
    expect(live.pieces.join('')).toBe('前半后半');
  });

  it('把聊天和楼层交给实时输出,楼层折叠区靠它定位', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => slowSse(['x'], [10], init.signal)));
    const done = requestCompletion(channel, messages, { source: '测试', floor: 7 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(done).resolves.toBe('x');
    expect(live.metas).toEqual([{ chatId: 'chat-1', floor: 7 }]);
  });
});
