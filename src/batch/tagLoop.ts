import type { TagRunOutcome } from '@/autoTag/runner';
import type { BatchTagJob } from '@/batch/jobStore';

/**
 * 批量写 tag 的主循环。外部依赖全部从 deps 注入,便于测试;真实接线见 batch/tagBatch.ts。
 *
 * 纪律:
 * - **一次只跑一楼**。柏宝绘按「本楼之前的楼」推导角色库,并发会让同一角色被重复建档;
 *   而且 ST 的 saveChat 在上一次没存完时只等 1 秒就静默放弃,并发写更容易丢保存。
 * - 每楼的写入与保存都由柏宝绘原本的单楼流程完成(与楼层按钮同一条路),这里不碰正文。
 * - 每跑完一楼就把进度写进本地记录,页面被杀后能从下一楼续跑。
 * - 页面在后台期间失败的楼不算失败:手机后台常把请求掐断,回到前台后重跑这一楼。
 * - 连续失败到上限就暂停(多半是渠道挂了),免得把剩下的楼全记成失败。
 */

export interface TagLoopDeps {
  runFloor: (floor: number) => Promise<TagRunOutcome>;
  currentChatId: () => string;
  /** 这一楼现在还该不该跑(AI 剧情楼且还没有 tag)。开跑后用户可能手动写过。 */
  isEligible: (floor: number) => boolean;
  /** 页面是否在后台。 */
  isHidden: () => boolean;
  /** 等页面回到前台;被停止时提前返回。 */
  waitVisible: (signal: AbortSignal) => Promise<void>;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  persist: (job: BatchTagJob) => void;
  onProgress?: (job: BatchTagJob, floor: number, outcome: TagRunOutcome | null) => void;
}

export interface TagLoopOptions {
  /** 每楼之间的间隔(毫秒)。 */
  gapMs: number;
  /** 连续失败几楼就暂停。 */
  maxConsecutiveFails: number;
  /** 同一楼因后台被打断最多重跑几次。 */
  maxHiddenRetries: number;
}

export const DEFAULT_LOOP_OPTIONS: TagLoopOptions = {
  gapMs: 2000,
  maxConsecutiveFails: 3,
  maxHiddenRetries: 3,
};

export async function runTagLoop(
  job: BatchTagJob,
  deps: TagLoopDeps,
  signal: AbortSignal,
  options: TagLoopOptions = DEFAULT_LOOP_OPTIONS,
): Promise<BatchTagJob> {
  job.status = 'running';
  job.note = '';
  deps.persist(job);
  let consecutiveFails = 0;
  let hiddenRetries = 0;

  while (job.cursor < job.floors.length) {
    if (signal.aborted) return pause(job, deps, '已停止');
    if (deps.currentChatId() !== job.chatId) return pause(job, deps, '已切换聊天，回到这个聊天后可以继续');
    if (deps.isHidden()) {
      await deps.waitVisible(signal);
      continue;
    }

    const floor = job.floors[job.cursor];
    if (!deps.isEligible(floor)) {
      job.skipped++;
      job.cursor++;
      deps.persist(job);
      deps.onProgress?.(job, floor, null);
      continue;
    }

    let wentHidden = deps.isHidden();
    const outcome = await deps.runFloor(floor);
    wentHidden = wentHidden || deps.isHidden();

    // 停止/切聊天打断的楼不记结果,续跑时从这一楼重来;但已经写进去的要记上,收尾才会核对它
    const interrupted = signal.aborted
      ? '已停止'
      : deps.currentChatId() !== job.chatId
        ? '已切换聊天，回到这个聊天后可以继续'
        : '';
    if (interrupted) {
      if (outcome.kind === 'written' || outcome.kind === 'none') record(job, floor, outcome);
      deps.persist(job);
      return pause(job, deps, interrupted);
    }

    if ((outcome.kind === 'failed' || outcome.kind === 'aborted') && wentHidden && hiddenRetries < options.maxHiddenRetries) {
      hiddenRetries++;
      await deps.waitVisible(signal);
      continue;
    }
    hiddenRetries = 0;

    record(job, floor, outcome);
    if (outcome.kind === 'failed' || outcome.kind === 'aborted') consecutiveFails++;
    else if (outcome.kind !== 'skipped') consecutiveFails = 0;
    deps.persist(job);
    deps.onProgress?.(job, floor, outcome);

    if (consecutiveFails >= options.maxConsecutiveFails) {
      return pause(job, deps, `连续 ${consecutiveFails} 楼失败，已暂停。检查一下副 API 渠道，再点继续`);
    }
    if (job.cursor < job.floors.length && options.gapMs > 0) await deps.sleep(options.gapMs, signal);
  }

  job.status = 'done';
  job.note = '';
  deps.persist(job);
  return job;
}

/** 记下一楼的结果并前进一格。 */
function record(job: BatchTagJob, floor: number, outcome: TagRunOutcome): void {
  if (outcome.kind === 'written') {
    job.written++;
    job.touched.push(floor);
  } else if (outcome.kind === 'none') {
    job.none++;
  } else if (outcome.kind === 'skipped') {
    job.skipped++;
  } else {
    const reason = outcome.kind === 'failed' ? (outcome.reason ?? '没有写入') : '被中断';
    job.fails = job.fails.filter(item => item.floor !== floor);
    job.fails.push({ floor, reason });
  }
  job.cursor++;
}

function pause(job: BatchTagJob, deps: TagLoopDeps, note: string): BatchTagJob {
  job.status = 'paused';
  job.note = note;
  deps.persist(job);
  return job;
}
