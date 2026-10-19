import { describe, expect, it, vi } from 'vitest';

import { createIdleWatchdog, FROZEN_DRIFT_MS, withIdleTimeout, type IdleDeps } from './idle';

/** 假时钟:手动推进时间、手动切前后台;定时器按到期时间触发。 */
function fakeDeps() {
  let now = 0;
  let hidden = false;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const visible = new Set<() => void>();
  const deps: IdleDeps = {
    now: () => now,
    isHidden: () => hidden,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: id => {
      timers.delete(id as number);
    },
    onVisible: fn => {
      visible.add(fn);
      return () => visible.delete(fn);
    },
  };
  /** 正常推进:沿途到期的定时器按时触发。 */
  const advance = (ms: number) => {
    const end = now + ms;
    for (; ;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  /** 页面被冻结:时间过去了但定时器没跑,解冻后积压的定时器才跑(迟到)。 */
  const freeze = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers.entries()]) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  return {
    deps,
    advance,
    freeze,
    setHidden(value: boolean) {
      hidden = value;
      if (!value) for (const fn of visible) fn();
    },
    pending: () => timers.size,
  };
}

describe('空闲超时看门狗', () => {
  it('一直有新内容就不超时,停了超过时限才超时', () => {
    const clock = fakeDeps();
    const onIdle = vi.fn();
    const dog = createIdleWatchdog(10_000, onIdle, clock.deps);
    for (let i = 0; i < 10; i++) {
      clock.advance(9_000);
      dog.bump();
    }
    expect(onIdle).not.toHaveBeenCalled();
    clock.advance(9_999);
    expect(onIdle).not.toHaveBeenCalled();
    clock.advance(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('页面在后台时不判超时,回前台后重新给一整轮', () => {
    const clock = fakeDeps();
    const onIdle = vi.fn();
    createIdleWatchdog(10_000, onIdle, clock.deps);
    clock.setHidden(true);
    clock.advance(60_000);
    expect(onIdle).not.toHaveBeenCalled();
    clock.setHidden(false);
    clock.advance(9_000);
    expect(onIdle).not.toHaveBeenCalled();
    clock.advance(11_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('定时器迟到(页面被冻结过)不直接判超时,从解冻时重新计时', () => {
    const clock = fakeDeps();
    const onIdle = vi.fn();
    const dog = createIdleWatchdog(10_000, onIdle, clock.deps);
    clock.freeze(10_000 + FROZEN_DRIFT_MS + 5_000);
    expect(onIdle).not.toHaveBeenCalled();
    // 解冻后积压的数据到了
    dog.bump();
    clock.advance(9_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('stop 之后不再触发,也不留定时器', () => {
    const clock = fakeDeps();
    const onIdle = vi.fn();
    const dog = createIdleWatchdog(10_000, onIdle, clock.deps);
    dog.stop();
    clock.advance(60_000);
    expect(onIdle).not.toHaveBeenCalled();
    expect(clock.pending()).toBe(0);
  });
});

describe('withIdleTimeout', () => {
  it('超时报「N秒没有新内容」,外部取消照常透传', async () => {
    const clock = fakeDeps();
    const never = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });

    const timed = withIdleTimeout(5, undefined, msg => new Error(msg), '副 API 请求', never, clock.deps);
    clock.advance(5_000);
    await expect(timed).rejects.toThrow('副 API 请求超时(5秒没有新内容)');

    const ctrl = new AbortController();
    const cancelled = withIdleTimeout(5, ctrl.signal, msg => new Error(msg), '副 API 请求', never, clock.deps);
    ctrl.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(clock.pending()).toBe(0);
  });
});
