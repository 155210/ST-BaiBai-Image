/**
 * 批量任务记录:存在浏览器本地(localStorage),刷新、被手机杀后台后还能接着跑。
 *
 * 只存楼号与计数,不存聊天内容。每个聊天各一份,在别的聊天开跑不会覆盖。
 * 读写失败(隐私模式、存储满)一律当没有记录处理——记录只是方便续跑,不是数据本身。
 */

export interface BatchFail {
  floor: number;
  reason: string;
}

/** tag = 批量写生图 tag;image = 批量给没图的 tag 出图。两种各记各的。 */
export type BatchKind = 'tag' | 'image';

export interface BatchJob {
  version: 1;
  kind: BatchKind;
  chatId: string;
  /** 本次要跑的楼(开跑时定下,升序)。 */
  floors: number[];
  /** 下一个要跑的位置(floors 的下标)。 */
  cursor: number;
  written: number;
  none: number;
  skipped: number;
  fails: BatchFail[];
  /** 本次写入过(tag 或图片指针)的楼:收尾时逐楼核对是否已存到服务器。 */
  touched: number[];
  status: 'running' | 'paused' | 'done';
  /** 暂停/结束的原因(给人看)。 */
  note: string;
  /** 出图:只出没图的(none)、只重出旧提示词的(stale),或两种都出(all,缺省)。 */
  mode?: 'all' | 'none' | 'stale';
  /** 写 tag:跑完后接着给写入了 tag 的楼出图。 */
  thenImages?: boolean;
  updatedAt: number;
}

const STORE_KEYS: Record<BatchKind, string> = {
  tag: 'bbi_batch_tag_jobs_v1',
  image: 'bbi_batch_image_jobs_v1',
};
/** 最多记几个聊天,多了丢最旧的。 */
const MAX_JOBS = 20;

function readAll(kind: BatchKind): Record<string, BatchJob> {
  try {
    const raw = localStorage.getItem(STORE_KEYS[kind]);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, BatchJob>) : {};
  } catch {
    return {};
  }
}

function writeAll(kind: BatchKind, all: Record<string, BatchJob>): void {
  try {
    const entries = Object.entries(all).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
    localStorage.setItem(STORE_KEYS[kind], JSON.stringify(Object.fromEntries(entries.slice(0, MAX_JOBS))));
  } catch {
    /* 存不下就算了:只影响续跑 */
  }
}

export function loadJob(kind: BatchKind, chatId: string): BatchJob | null {
  if (!chatId) return null;
  const job = readAll(kind)[chatId];
  // 早期记录没有 kind 字段:按所在的表补上
  return job && job.version === 1 && Array.isArray(job.floors) ? { ...job, kind } : null;
}

export function saveJob(job: BatchJob): void {
  if (!job.chatId) return;
  const all = readAll(job.kind);
  all[job.chatId] = { ...job, updatedAt: Date.now() };
  writeAll(job.kind, all);
}

export function clearJob(kind: BatchKind, chatId: string): void {
  const all = readAll(kind);
  if (!(chatId in all)) return;
  delete all[chatId];
  writeAll(kind, all);
}

export function createJob(
  kind: BatchKind,
  chatId: string,
  floors: number[],
  mode: BatchJob['mode'] = 'all',
): BatchJob {
  return {
    version: 1,
    kind,
    chatId,
    floors,
    mode,
    cursor: 0,
    written: 0,
    none: 0,
    skipped: 0,
    fails: [],
    touched: [],
    status: 'running',
    note: '',
    updatedAt: Date.now(),
  };
}
