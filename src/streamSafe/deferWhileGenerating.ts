import { getContext, type STContext } from '@/st/context';

/**
 * (本 fork 新增)酒馆正在出字时,写完 tag 后的通知先压住,等输出完再发。
 *
 * 背景:写 tag 存盘后要发 MESSAGE_EDITED / MESSAGE_UPDATED,好让卡片、别的插件知道这楼改了。
 * 可如果这时下一轮回复正在流式输出,而某个插件收到通知就整页重绘聊天(或退回整段重载),
 * 酒馆的流式还在往旧的那块楼层里写字:界面上不再出字,停止按钮却一直亮着,像断网一样。
 * 所以输出期间只刷新本楼(不发事件、不整段重载),事件排队,等停止按钮消失后按原顺序补发。
 *
 * 补发前核对:聊天没换、那一楼还是同一条消息;对不上就丢掉(该刷新的已由酒馆自己渲染)。
 */

interface Pending {
  chatId: string | undefined;
  floor: number;
  message: unknown;
  run: () => Promise<void> | void;
}

const queue: Pending[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
/** 停止按钮消失后多久检查一次。 */
const POLL_MS = 500;

/** 酒馆正在生成:输出期间显示停止按钮(#mes_stop)。 */
export function isGenerating(): boolean {
  const stop = typeof document === 'undefined' ? null : document.getElementById?.('mes_stop');
  if (!stop) return false;
  const display = typeof getComputedStyle === 'function' ? getComputedStyle(stop).display : stop.style?.display;
  return !!display && display !== 'none';
}

/**
 * 正在生成就把 run 排进队列并返回 true(调用方别再立刻执行);没在生成返回 false。
 */
export function deferWhileGenerating(context: STContext, floor: number, run: () => Promise<void> | void): boolean {
  if (!isGenerating()) return false;
  queue.push({ chatId: context.getCurrentChatId?.(), floor, message: context.chat?.[floor], run });
  timer ??= setInterval(() => void flush(), POLL_MS);
  return true;
}

/** 生成结束后按顺序补发;聊天换了或那楼换了消息的跳过。 */
export async function flush(): Promise<void> {
  if (isGenerating()) return;
  const context = getContext();
  if (timer) clearInterval(timer);
  timer = null;
  const items = queue.splice(0);
  for (const item of items) {
    if (!context || context.getCurrentChatId?.() !== item.chatId || context.chat?.[item.floor] !== item.message) continue;
    try {
      await item.run();
    } catch (error) {
      console.warn('[柏宝绘] 补发楼层更新通知失败', error);
    }
  }
}

/** 测试用:队列里还有几条。 */
export function pendingCount(): number {
  return queue.length;
}
