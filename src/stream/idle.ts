/**
 * (本 fork 新增)流式请求的「空闲超时」:多少秒**没有新文字**才算超时,而不是整次请求总时长。
 *
 * 为什么不用总时长:推理模型 + 长楼层,正常写完可能就要好几分钟;总时长设短了会
 * 把正在顺利输出的请求掐掉,设长了真卡住时又要干等很久。流式能看到「还在出字」,
 * 按「多久没出新字」判断卡死才对得上用户的直觉。
 *
 * 只有真正的文字增量(正文或思维链)才算「有动静」:有的代理会发 `: keep-alive`
 * 之类的心跳行,如果字节就算活着,卡死的上游会被心跳一直续命、永远不超时。
 *
 * 手机切后台的保护:安卓浏览器会冻结后台页面的定时器,回到前台时积压的定时器可能
 * 先于积压的网络数据跑——直接按时间差判超时,会把一个其实一直在出字的请求误杀。
 * 所以:① 页面在后台时不判超时;② 定时器比预定时间晚了很多(页面被冻结过)时,
 * 从现在重新计时;③ 回到前台时重新计时。宁可回前台后多等一轮,也不误杀。
 */

/** 依赖注入点,测试里换成假时钟。 */
export interface IdleDeps {
  now(): number;
  isHidden(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** 订阅「页面回到前台」,返回退订函数。 */
  onVisible(fn: () => void): () => void;
}

/** 定时器迟到超过这么多毫秒,视为页面被冻结过,从头计时。 */
export const FROZEN_DRIFT_MS = 2000;

const browserDeps: IdleDeps = {
  now: () => Date.now(),
  isHidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  onVisible: fn => {
    if (typeof document === 'undefined') return () => {};
    const listener = () => {
      if (document.visibilityState === 'visible') fn();
    };
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

export interface IdleWatchdog {
  /** 有新文字:重新计时。 */
  bump(): void;
  /** 停表(请求结束时必须调,否则定时器会在结束后误触发)。 */
  stop(): void;
}

export function createIdleWatchdog(
  idleMs: number,
  onIdle: () => void,
  deps: IdleDeps = browserDeps,
): IdleWatchdog {
  let last = deps.now();
  let timer: unknown = null;
  let expectedAt = 0;
  let stopped = false;

  const schedule = (ms: number) => {
    expectedAt = deps.now() + ms;
    timer = deps.setTimer(check, ms);
  };

  function check(): void {
    timer = null;
    if (stopped) return;
    const now = deps.now();
    if (deps.isHidden() || now - expectedAt > FROZEN_DRIFT_MS) {
      // 后台或刚被冻结过:这段时间不算,从现在重新计一整轮
      last = now;
      schedule(idleMs);
      return;
    }
    const idle = now - last;
    if (idle >= idleMs) {
      stopped = true;
      unsubscribe();
      onIdle();
      return;
    }
    schedule(idleMs - idle);
  }

  const unsubscribe = deps.onVisible(() => {
    last = Math.max(last, deps.now());
  });
  schedule(idleMs);

  return {
    bump() {
      last = deps.now();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
  };
}

/**
 * 给流式请求套空闲超时。task 拿到 signal 与 bump:每收到新文字调一次 bump。
 * 外部 signal 仍可提前取消;只有空闲定时器触发时才转换成明确的超时报错。
 */
export async function withIdleTimeout<T>(
  idleSec: number,
  externalSignal: AbortSignal | undefined,
  makeError: (message: string) => Error,
  label: string,
  task: (signal: AbortSignal, bump: () => void) => Promise<T>,
  deps?: IdleDeps,
): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => ctrl.abort();
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const watchdog = createIdleWatchdog(
    Math.max(1000, idleSec * 1000),
    () => {
      timedOut = true;
      ctrl.abort();
    },
    deps,
  );

  try {
    return await task(ctrl.signal, () => watchdog.bump());
  } catch (e) {
    if (timedOut) throw makeError(`${label}超时(${idleSec}秒没有新内容)`);
    throw e;
  } finally {
    watchdog.stop();
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}
