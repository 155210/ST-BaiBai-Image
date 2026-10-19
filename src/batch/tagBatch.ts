import { reactive } from 'vue';

import { cancelFloorTags, requestFloorTags } from '@/autoTag/runner';
import { clearJob, createJob, loadJob, saveJob, type BatchTagJob } from '@/batch/jobStore';
import { DEFAULT_LOOP_OPTIONS, runTagLoop } from '@/batch/tagLoop';
import { saveAndVerify } from '@/batch/verifySaved';
import { isCurrentChatExcluded, settings } from '@/state/settings';
import { getContext, isAiStoryMessage } from '@/st/context';
import { hasImageTagTrace } from '@/st/imageTagRegex';

/**
 * 批量写 tag 的控制器:把 tagLoop 接到真实的柏宝绘单楼流程上,并给批量页提供响应式状态。
 *
 * 不渲染楼层、不点按钮:直接按楼层数据调用 requestFloorTags(与楼层按钮同一条路),
 * 所以 2000 楼的聊天也不用把楼画到页面上,手机切后台也不会把楼误判成「找不到按钮」。
 */

export const batchState = reactive({
  running: false,
  /** 当前聊天的任务记录(没有则 null)。 */
  job: null as BatchTagJob | null,
  /** 正在跑的楼。 */
  currentFloor: null as number | null,
  /** 页面在后台、等回前台。 */
  waitingVisible: false,
  /** 收尾核对的结果(给人看)。 */
  verifyNote: '',
  verifying: false,
  /** 核对没通过的楼。 */
  unsaved: [] as number[],
  log: [] as string[],
});

let controller: AbortController | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;

function log(line: string): void {
  const time = new Date().toLocaleTimeString();
  batchState.log.unshift(`${time} ${line}`);
  if (batchState.log.length > 80) batchState.log.length = 80;
}

function currentChatId(): string {
  return getContext()?.getCurrentChatId?.() ?? '';
}

/** 这一楼现在适不适合批量写 tag:AI 剧情楼,且还没有 tag。 */
export function isBatchEligible(floor: number): boolean {
  const message = getContext()?.chat?.[floor];
  return isAiStoryMessage(message) && !hasImageTagTrace(message.mes);
}

/** 打开批量页或切聊天时调用:载入当前聊天的任务记录。 */
export function refreshBatchJob(): void {
  if (batchState.running) return;
  batchState.job = loadJob(currentChatId());
  batchState.verifyNote = '';
  batchState.unsaved = [];
}

/** 开跑前的阻断原因;能跑返回空串。 */
export function batchBlocker(): string {
  if (batchState.running) return '已经在跑了';
  if (!settings.enabled) return '柏宝绘已停用，请先在设置里开启';
  if (!currentChatId()) return '先打开一个聊天';
  if (isCurrentChatExcluded()) return '这个角色在排除名单里，不生成生图 tag';
  return '';
}

function waitVisible(signal: AbortSignal): Promise<void> {
  if (!document.hidden || signal.aborted) return Promise.resolve();
  batchState.waitingVisible = true;
  log('页面在后台，先暂停；回到酒馆页面后自动继续');
  return new Promise(resolve => {
    const done = () => {
      if (document.hidden && !signal.aborted) return;
      document.removeEventListener('visibilitychange', done);
      signal.removeEventListener('abort', done);
      batchState.waitingVisible = false;
      if (!signal.aborted) log('回到前台，继续');
      // 回前台后给网络一点时间恢复
      setTimeout(resolve, signal.aborted ? 0 : 800);
    };
    document.addEventListener('visibilitychange', done);
    signal.addEventListener('abort', done);
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish);
  });
}

/** 跑的时候不让手机息屏:息屏后浏览器会冻结页面。拿不到(不支持/被拒)就算了。 */
async function holdWakeLock(): Promise<void> {
  if (wakeLock || !settings.enabled) return;
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock(): void {
  const lock = wakeLock;
  wakeLock = null;
  void lock?.release().catch(() => undefined);
}

// 息屏锁在页面进后台时会被浏览器自动释放,回前台要重新申请
document.addEventListener('visibilitychange', () => {
  if (document.hidden) wakeLock = null;
  else if (batchState.running) void holdWakeLock();
});

async function run(job: BatchTagJob, gapMs: number): Promise<void> {
  controller = new AbortController();
  const signal = controller.signal;
  batchState.running = true;
  batchState.job = job;
  batchState.verifyNote = '';
  batchState.unsaved = [];
  void holdWakeLock();
  try {
    await runTagLoop(
      job,
      {
        runFloor: floor => {
          batchState.currentFloor = floor;
          return requestFloorTags(floor, { quiet: true });
        },
        currentChatId,
        isEligible: isBatchEligible,
        isHidden: () => document.hidden,
        waitVisible,
        sleep,
        persist: saveJob,
        onProgress: (current, floor, outcome) => {
          batchState.job = { ...current };
          if (outcome?.kind === 'failed') log(`第 ${floor} 楼失败：${outcome.reason ?? '没有写入'}`);
        },
      },
      signal,
      { ...DEFAULT_LOOP_OPTIONS, gapMs },
    );
  } catch (error) {
    job.status = 'paused';
    job.note = `出错暂停：${error instanceof Error ? error.message : String(error)}`;
    saveJob(job);
    console.error('[柏宝绘] 批量 tag 出错', error);
  } finally {
    batchState.currentFloor = null;
    batchState.job = { ...job };
    batchState.running = false;
    controller = null;
    releaseWakeLock();
  }
  log(
    `${job.status === 'done' ? '跑完了' : job.note}：写入 ${job.written} 楼，不需要图 ${job.none} 楼，失败 ${job.fails.length} 楼`,
  );
  if (job.status === 'done') {
    toastr.success(`批量 tag 跑完：写入 ${job.written} 楼，失败 ${job.fails.length} 楼`, '柏宝绘');
  }
  await verify(job);
}

async function verify(job: BatchTagJob): Promise<void> {
  if (!job.touched.length || currentChatId() !== job.chatId) return;
  batchState.verifying = true;
  batchState.verifyNote = '正在核对是否已存到服务器…';
  try {
    const result = await saveAndVerify(job.chatId, job.touched);
    if (result.ok) {
      batchState.unsaved = [];
      batchState.verifyNote = `保存核对通过：写入的 ${job.touched.length} 楼都已存到服务器`;
    } else if (result.error && !result.floors.length) {
      batchState.verifyNote = `没法核对（${result.error}），建议手动导出一份聊天备份`;
    } else {
      batchState.unsaved = result.floors;
      batchState.verifyNote = `有 ${result.floors.length} 楼还没存到服务器。先别刷新页面，点「重新保存并核对」`;
      toastr.error('有楼层没存到服务器。先别刷新页面，回批量页点「重新保存并核对」。', '柏宝绘', {
        timeOut: 0,
      });
    }
    log(batchState.verifyNote);
  } finally {
    batchState.verifying = false;
  }
}

/** 按楼号开一个新任务(会覆盖本聊天旧的任务记录)。 */
export function startBatch(floors: number[], gapMs: number): void {
  if (batchBlocker()) return;
  const job = createJob(currentChatId(), floors);
  saveJob(job);
  log(`开始：共 ${floors.length} 楼`);
  void run(job, gapMs);
}

/** 从上次停下的地方继续。 */
export function resumeBatch(gapMs: number): void {
  if (batchBlocker()) return;
  const job = loadJob(currentChatId());
  if (!job || job.cursor >= job.floors.length) return;
  log(`继续：从第 ${job.cursor + 1}/${job.floors.length} 个开始`);
  void run(job, gapMs);
}

/** 只重跑失败的楼。 */
export function retryFailed(gapMs: number): void {
  if (batchBlocker()) return;
  const old = loadJob(currentChatId());
  if (!old?.fails.length) return;
  const job = createJob(old.chatId, old.fails.map(item => item.floor).sort((a, b) => a - b));
  saveJob(job);
  log(`重试失败的 ${job.floors.length} 楼`);
  void run(job, gapMs);
}

export function stopBatch(): void {
  if (!controller) return;
  controller.abort();
  // 在途的那一楼一起取消,不必等它的请求回来
  if (batchState.currentFloor !== null) cancelFloorTags(batchState.currentFloor);
  log('正在停止…');
}

export function forgetBatch(): void {
  if (batchState.running) return;
  clearJob(currentChatId());
  batchState.job = null;
  batchState.verifyNote = '';
  batchState.unsaved = [];
}

export async function reverifyBatch(): Promise<void> {
  const job = batchState.job;
  if (!job || batchState.running || batchState.verifying) return;
  await verify(job);
}
