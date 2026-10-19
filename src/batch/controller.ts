import { reactive } from 'vue';

import { backendStatus } from '@/generate';
import { cancelFloorTags, requestFloorTags } from '@/autoTag/runner';
import { cancelCurrentImage, pendingImageSeqs, runImageFloor, type ImageMode } from '@/batch/imageFloor';
import { notifyDone } from '@/batch/notify';
import { clearJob, createJob, loadJob, saveJob, type BatchJob, type BatchKind } from '@/batch/jobStore';
import { DEFAULT_LOOP_OPTIONS, runBatchLoop } from '@/batch/loop';
import { saveAndVerify } from '@/batch/verifySaved';
import { isCurrentChatExcluded, settings } from '@/state/settings';
import { getContext, isAiStoryMessage } from '@/st/context';
import { hasImageTagTrace } from '@/st/imageTagRegex';

/**
 * 批量控制器:把 loop.ts 接到柏宝绘真实的单楼动作上,并给批量页提供响应式状态。
 *
 * - 写 tag:直接按楼层数据调用 requestFloorTags(与楼层按钮同一条路);
 * - 出图:对本楼没图的 tag 调 slotGenerate(与卡片「生成图片」同一条路)。
 * 都不需要把楼渲染到页面上,所以 2000 楼的聊天也不卡,手机切后台也不会误判。
 *
 * 同一时间只跑一个批量(写 tag 和出图不同时跑):两者都会逐楼保存整份聊天,
 * 叠在一起只会更容易撞上 ST「上次没存完就放弃这次保存」。
 */

const LABEL: Record<BatchKind, string> = { tag: '批量 tag', image: '批量出图' };

export const batchState = reactive({
  /** 正在跑的那一种;null = 空闲。 */
  running: null as BatchKind | null,
  /** 当前聊天两种任务的记录(没有则 null)。 */
  jobs: { tag: null, image: null } as Record<BatchKind, BatchJob | null>,
  /** 正在跑的楼。 */
  currentFloor: null as number | null,
  /** 页面在后台、等回前台。 */
  waitingVisible: false,
  /** 收尾核对的结果(给人看),按种类分开。 */
  verifyNote: { tag: '', image: '' } as Record<BatchKind, string>,
  verifying: false,
  /** 核对没通过的楼。 */
  unsaved: { tag: [], image: [] } as Record<BatchKind, number[]>,
  log: [] as string[],
});

let controller: AbortController | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;

function log(line: string): void {
  const time = new Date().toLocaleTimeString();
  batchState.log.unshift(`${time} ${line}`);
  if (batchState.log.length > 80) batchState.log.length = 80;
}

/** 批量页上填的「每楼间隔」(秒,记在浏览器本地);写 tag 默认 2 秒、出图默认 3 秒。 */
export function savedGapMs(kind: BatchKind): number {
  let seconds = kind === 'tag' ? 2 : 3;
  try {
    const raw = localStorage.getItem(`bbi_batch_${kind}_gap_seconds`);
    if (raw !== null && raw !== '') seconds = Number(raw) || 0;
  } catch {
    /* 读不到就用默认 */
  }
  return Math.round(Math.min(60, Math.max(0, seconds)) * 1000);
}

function currentChatId(): string {
  return getContext()?.getCurrentChatId?.() ?? '';
}

/** 写 tag:AI 剧情楼,且还没有 tag。 */
export function needsTag(floor: number): boolean {
  const message = getContext()?.chat?.[floor];
  return isAiStoryMessage(message) && !hasImageTagTrace(message.mes);
}

/** 出图:本楼有还没图的 tag。 */
export function needsImage(floor: number, mode: ImageMode = 'all'): boolean {
  return pendingImageSeqs(getContext()?.chat?.[floor], mode).length > 0;
}

/** 本楼要出几张图(预估用)。 */
export function pendingImageCount(floor: number, mode: ImageMode = 'all'): number {
  return pendingImageSeqs(getContext()?.chat?.[floor], mode).length;
}

function eligible(job: BatchJob): (floor: number) => boolean {
  if (job.kind === 'tag') return needsTag;
  const mode = job.mode ?? 'all';
  return floor => needsImage(floor, mode);
}

/** 打开批量页或切聊天时调用:载入当前聊天的任务记录。 */
export function refreshBatchJobs(): void {
  if (batchState.running) return;
  const chatId = currentChatId();
  for (const kind of ['tag', 'image'] as const) {
    batchState.jobs[kind] = loadJob(kind, chatId);
    batchState.verifyNote[kind] = '';
    batchState.unsaved[kind] = [];
  }
}

/** 开跑前的阻断原因;能跑返回空串。 */
export function batchBlocker(kind: BatchKind): string {
  if (batchState.running) return `${LABEL[batchState.running]}正在跑，先等它跑完或停止`;
  if (!settings.enabled) return '柏宝绘已停用，请先在设置里开启';
  if (!currentChatId()) return '先打开一个聊天';
  if (kind === 'tag' && isCurrentChatExcluded()) return '这个角色在排除名单里，不生成生图 tag';
  if (kind === 'image') {
    const status = backendStatus();
    if (!status.configured) return status.reason || '出图渠道还没配好';
  }
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
  if (wakeLock) return;
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

async function run(job: BatchJob, gapMs: number): Promise<void> {
  const kind = job.kind;
  controller = new AbortController();
  const signal = controller.signal;
  batchState.running = kind;
  batchState.jobs[kind] = job;
  batchState.verifyNote[kind] = '';
  batchState.unsaved[kind] = [];
  void holdWakeLock();
  try {
    await runBatchLoop(
      job,
      {
        runFloor: floor => {
          batchState.currentFloor = floor;
          return kind === 'tag'
            ? requestFloorTags(floor, { quiet: true })
            : runImageFloor(floor, signal, job.mode ?? 'all');
        },
        currentChatId,
        isEligible: eligible(job),
        isHidden: () => document.hidden,
        waitVisible,
        sleep,
        persist: saveJob,
        onProgress: (current, floor, outcome) => {
          batchState.jobs[kind] = { ...current };
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
    console.error(`[柏宝绘] ${LABEL[kind]}出错`, error);
  } finally {
    batchState.currentFloor = null;
    batchState.jobs[kind] = { ...job };
    batchState.running = null;
    controller = null;
    releaseWakeLock();
  }
  const done = kind === 'tag' ? `写入 ${job.written} 楼，不需要图 ${job.none} 楼` : `出图 ${job.written} 楼`;
  log(`${LABEL[kind]}${job.status === 'done' ? '跑完了' : job.note}：${done}，失败 ${job.fails.length} 楼`);
  if (job.status === 'done') {
    toastr.success(`${LABEL[kind]}跑完：${done}，失败 ${job.fails.length} 楼`, '柏宝绘');
    notifyDone(`${LABEL[kind]}跑完了`, `${done}，失败 ${job.fails.length} 楼`);
  }
  await verify(job);
  chainImages(job);
}

/** 「写完 tag 接着出图」:写 tag 跑完后,给这次写入了 tag 的楼开一个出图任务。 */
function chainImages(job: BatchJob): void {
  if (job.kind !== 'tag' || !job.thenImages || job.status !== 'done') return;
  if (currentChatId() !== job.chatId || batchState.running) return;
  const floors = [...new Set(job.touched)].sort((a, b) => a - b).filter(floor => needsImage(floor));
  if (!floors.length) return;
  const blocker = batchBlocker('image');
  if (blocker) {
    log(`没能接着出图：${blocker}`);
    toastr.warning(`tag 写完了，但没能接着出图：${blocker}`, '柏宝绘');
    return;
  }
  log(`接着出图：${floors.length} 楼`);
  startBatch('image', floors, savedGapMs('image'));
}

async function verify(job: BatchJob): Promise<void> {
  const kind = job.kind;
  if (!job.touched.length || currentChatId() !== job.chatId) return;
  batchState.verifying = true;
  batchState.verifyNote[kind] = '正在核对是否已存到服务器…';
  try {
    const result = await saveAndVerify(job.chatId, job.touched);
    if (result.ok) {
      batchState.unsaved[kind] = [];
      batchState.verifyNote[kind] = `保存核对通过：改过的 ${job.touched.length} 楼都已存到服务器`;
    } else if (result.error && !result.floors.length) {
      batchState.verifyNote[kind] = `没法核对（${result.error}），建议手动导出一份聊天备份`;
    } else {
      batchState.unsaved[kind] = result.floors;
      batchState.verifyNote[kind] = `有 ${result.floors.length} 楼还没存到服务器。先别刷新页面，点「重新保存并核对」`;
      toastr.error('有楼层没存到服务器。先别刷新页面，回批量页点「重新保存并核对」。', '柏宝绘', {
        timeOut: 0,
      });
    }
    log(batchState.verifyNote[kind]);
  } finally {
    batchState.verifying = false;
  }
}

export interface StartOptions {
  /** 出图:挑哪些槽位。 */
  mode?: ImageMode;
  /** 写 tag:跑完后接着出图。 */
  thenImages?: boolean;
}

/** 按楼号开一个新任务(会覆盖本聊天同种类的旧记录)。 */
export function startBatch(kind: BatchKind, floors: number[], gapMs: number, options: StartOptions = {}): void {
  if (batchBlocker(kind)) return;
  const job = createJob(kind, currentChatId(), floors, options.mode ?? 'all');
  if (kind === 'tag' && options.thenImages) job.thenImages = true;
  saveJob(job);
  log(`${LABEL[kind]}开始：共 ${floors.length} 楼`);
  void run(job, gapMs);
}

/** 从上次停下的地方继续。 */
export function resumeBatch(kind: BatchKind, gapMs: number): void {
  if (batchBlocker(kind)) return;
  const job = loadJob(kind, currentChatId());
  if (!job || job.cursor >= job.floors.length) return;
  log(`${LABEL[kind]}继续：从第 ${job.cursor + 1}/${job.floors.length} 个开始`);
  void run(job, gapMs);
}

/** 只重跑失败的楼。 */
export function retryFailed(kind: BatchKind, gapMs: number): void {
  if (batchBlocker(kind)) return;
  const old = loadJob(kind, currentChatId());
  if (!old?.fails.length) return;
  const job = createJob(
    kind,
    old.chatId,
    old.fails.map(item => item.floor).sort((a, b) => a - b),
    old.mode ?? 'all',
  );
  if (old.thenImages) job.thenImages = true;
  saveJob(job);
  log(`${LABEL[kind]}：重试失败的 ${job.floors.length} 楼`);
  void run(job, gapMs);
}

export function stopBatch(): void {
  if (!controller) return;
  controller.abort();
  // 在途的那一楼一起取消,不必等它的请求回来
  if (batchState.running === 'tag' && batchState.currentFloor !== null) cancelFloorTags(batchState.currentFloor);
  if (batchState.running === 'image') cancelCurrentImage();
  log('正在停止…');
}

export function forgetBatch(kind: BatchKind): void {
  if (batchState.running) return;
  clearJob(kind, currentChatId());
  batchState.jobs[kind] = null;
  batchState.verifyNote[kind] = '';
  batchState.unsaved[kind] = [];
}

export async function reverifyBatch(kind: BatchKind): Promise<void> {
  const job = batchState.jobs[kind];
  if (!job || batchState.running || batchState.verifying) return;
  await verify(job);
}
