import { describe, expect, it, vi } from 'vitest';

import type { TagRunOutcome } from '@/autoTag/runner';
import { createJob, type BatchTagJob } from '@/batch/jobStore';
import { runTagLoop, type TagLoopDeps } from '@/batch/tagLoop';

const OPTIONS = { gapMs: 0, maxConsecutiveFails: 3, maxHiddenRetries: 2 };

function deps(overrides: Partial<TagLoopDeps> = {}): TagLoopDeps {
  return {
    runFloor: async () => ({ kind: 'written' }),
    currentChatId: () => 'chat',
    isEligible: () => true,
    isHidden: () => false,
    waitVisible: async () => undefined,
    sleep: async () => undefined,
    persist: () => undefined,
    ...overrides,
  };
}

function outcomes(map: Record<number, TagRunOutcome | TagRunOutcome[]>) {
  const seen = new Map<number, number>();
  return async (floor: number): Promise<TagRunOutcome> => {
    const value = map[floor] ?? { kind: 'written' };
    if (!Array.isArray(value)) return value;
    const index = seen.get(floor) ?? 0;
    seen.set(floor, index + 1);
    return value[Math.min(index, value.length - 1)];
  };
}

describe('runTagLoop', () => {
  it('runs floors in order and tallies each outcome', async () => {
    const order: number[] = [];
    const job = createJob('chat', [1, 3, 5, 7]);
    const run = outcomes({ 3: { kind: 'none' }, 5: { kind: 'failed', reason: 'boom' }, 7: { kind: 'skipped' } });
    await runTagLoop(
      job,
      deps({ runFloor: floor => (order.push(floor), run(floor)) }),
      new AbortController().signal,
      OPTIONS,
    );
    expect(order).toEqual([1, 3, 5, 7]);
    expect(job).toMatchObject({ status: 'done', cursor: 4, written: 1, none: 1, skipped: 1, touched: [1] });
    expect(job.fails).toEqual([{ floor: 5, reason: 'boom' }]);
  });

  it('skips floors that stopped being eligible without calling the runner', async () => {
    const runFloor = vi.fn(async (): Promise<TagRunOutcome> => ({ kind: 'written' }));
    const job = createJob('chat', [1, 2]);
    await runTagLoop(job, deps({ runFloor, isEligible: floor => floor !== 1 }), new AbortController().signal, OPTIONS);
    expect(runFloor).toHaveBeenCalledTimes(1);
    expect(job).toMatchObject({ skipped: 1, written: 1, cursor: 2 });
  });

  it('persists after every floor so a killed page resumes at the next one', async () => {
    const cursors: number[] = [];
    const job = createJob('chat', [1, 2, 3]);
    await runTagLoop(job, deps({ persist: saved => cursors.push(saved.cursor) }), new AbortController().signal, OPTIONS);
    expect(cursors).toEqual([0, 1, 2, 3, 3]);
  });

  it('pauses after too many consecutive failures', async () => {
    const job = createJob('chat', [1, 2, 3, 4, 5]);
    await runTagLoop(
      job,
      deps({ runFloor: async () => ({ kind: 'failed', reason: 'down' }) }),
      new AbortController().signal,
      OPTIONS,
    );
    expect(job.status).toBe('paused');
    expect(job.cursor).toBe(3);
    expect(job.note).toContain('连续 3 楼失败');
  });

  it('a success resets the consecutive failure count', async () => {
    const job = createJob('chat', [1, 2, 3, 4, 5]);
    const failed: TagRunOutcome = { kind: 'failed' };
    await runTagLoop(job, deps({ runFloor: outcomes({ 1: failed, 2: failed, 4: failed, 5: failed }) }), new AbortController().signal, OPTIONS);
    expect(job.status).toBe('done');
    expect(job.fails.map(item => item.floor)).toEqual([1, 2, 4, 5]);
  });

  it('re-runs a floor that failed while the page was in the background', async () => {
    let hidden = false;
    const waitVisible = vi.fn(async () => {
      hidden = false;
    });
    const runFloor = vi.fn(async (floor: number): Promise<TagRunOutcome> => {
      if (floor === 2 && runFloor.mock.calls.filter(([f]) => f === 2).length === 1) {
        hidden = true;
        return { kind: 'failed', reason: 'network' };
      }
      return { kind: 'written' };
    });
    const job = createJob('chat', [1, 2, 3]);
    await runTagLoop(job, deps({ runFloor, isHidden: () => hidden, waitVisible }), new AbortController().signal, OPTIONS);
    expect(runFloor.mock.calls.map(([floor]) => floor)).toEqual([1, 2, 2, 3]);
    expect(waitVisible).toHaveBeenCalled();
    expect(job).toMatchObject({ status: 'done', written: 3, fails: [] });
  });

  it('stops without recording the in-flight floor when aborted, and resumes from it', async () => {
    const controller = new AbortController();
    const job: BatchTagJob = createJob('chat', [1, 2, 3]);
    await runTagLoop(
      job,
      deps({
        runFloor: async floor => {
          if (floor === 2) {
            controller.abort();
            return { kind: 'aborted' };
          }
          return { kind: 'written' };
        },
      }),
      controller.signal,
      OPTIONS,
    );
    expect(job).toMatchObject({ status: 'paused', cursor: 1, note: '已停止', fails: [] });

    await runTagLoop(job, deps(), new AbortController().signal, OPTIONS);
    expect(job).toMatchObject({ status: 'done', cursor: 3, touched: [1, 2, 3] });
  });

  it('still records a floor that finished writing just as the stop came in', async () => {
    const controller = new AbortController();
    const job = createJob('chat', [1, 2]);
    await runTagLoop(
      job,
      deps({
        runFloor: async () => {
          controller.abort();
          return { kind: 'written' };
        },
      }),
      controller.signal,
      OPTIONS,
    );
    expect(job).toMatchObject({ status: 'paused', cursor: 1, written: 1, touched: [1] });
  });

  it('pauses when the chat changes', async () => {
    let chatId = 'chat';
    const job = createJob('chat', [1, 2, 3]);
    await runTagLoop(
      job,
      deps({
        currentChatId: () => chatId,
        runFloor: async floor => {
          if (floor === 2) chatId = 'other';
          return { kind: 'aborted' };
        },
      }),
      new AbortController().signal,
      { ...OPTIONS, maxConsecutiveFails: 9 },
    );
    expect(job.status).toBe('paused');
    expect(job.note).toContain('已切换聊天');
    expect(job.cursor).toBe(1);
  });
});
