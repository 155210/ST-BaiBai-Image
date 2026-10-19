import { reactive } from 'vue';

/**
 * 副 API 流式输出的实时文本(本 fork 新增,作者代码里只有 api/client.ts 调 beginStream)。
 *
 * 省性能的做法:
 * - 收到的片段只拼进一个普通字符串(不是响应式),没人看时不触发任何渲染;
 * - 只有展开的「实时输出」面板在看时(watchers > 0),才每 0.5 秒把文本抄一份到响应式的 view;
 * - 文本只留最后 MAX_CHARS 个字,长输出不会越攒越大。
 */

const MAX_CHARS = 20000;
export const REFRESH_MS = 500;

interface Live {
  id: number;
  source: string;
  text: string;
  done: boolean;
  error: string;
}

let nextId = 1;
let current: Live | null = null;
let dirty = false;
let watchers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** 面板展示用。只在有人展开面板时更新。 */
export const streamView = reactive({
  source: '',
  text: '',
  running: false,
  error: '',
  /** 有过至少一次流式请求。 */
  seen: false,
});

function flush(): void {
  if (!dirty) return;
  dirty = false;
  streamView.source = current?.source ?? '';
  streamView.text = liveText();
  streamView.running = !!current && !current.done;
  streamView.error = current?.error ?? '';
  streamView.seen = !!current;
}

export interface StreamTap {
  push(piece: string): void;
  end(error?: string): void;
}

/** 一次流式请求开始。并发时面板显示最新开始的那一条。 */
export function beginStream(source: string): StreamTap {
  const live: Live = { id: nextId++, source, text: '', done: false, error: '' };
  current = live;
  dirty = true;
  return {
    push(piece) {
      if (!piece) return;
      live.text += piece;
      if (live.text.length > MAX_CHARS * 2) live.text = live.text.slice(-MAX_CHARS);
      if (current === live) dirty = true;
    },
    end(error = '') {
      live.done = true;
      live.error = error;
      if (current === live) dirty = true;
      if (watchers) flush();
    },
  };
}

/** 面板展开时调用,返回收起时要调的函数。 */
export function watchStream(): () => void {
  watchers++;
  dirty = true;
  flush();
  if (!timer) timer = setInterval(flush, REFRESH_MS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    watchers--;
    if (!watchers && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** 只读当前文本(测试用)。 */
export function liveText(): string {
  const text = current?.text ?? '';
  return text.length > MAX_CHARS ? text.slice(-MAX_CHARS) : text;
}

export function isWatched(): boolean {
  return watchers > 0;
}
