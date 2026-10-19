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

export interface BatchTagJob {
  version: 1;
  chatId: string;
  /** 本次要跑的楼(开跑时定下,升序)。 */
  floors: number[];
  /** 下一个要跑的位置(floors 的下标)。 */
  cursor: number;
  written: number;
  none: number;
  skipped: number;
  fails: BatchFail[];
  /** 本次写入过 tag 的楼:收尾时逐楼核对是否已存到服务器。 */
  touched: number[];
  status: 'running' | 'paused' | 'done';
  /** 暂停/结束的原因(给人看)。 */
  note: string;
  updatedAt: number;
}

const STORE_KEY = 'bbi_batch_tag_jobs_v1';
/** 最多记几个聊天,多了丢最旧的。 */
const MAX_JOBS = 20;

function readAll(): Record<string, BatchTagJob> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, BatchTagJob>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, BatchTagJob>): void {
  try {
    const entries = Object.entries(all).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, MAX_JOBS))));
  } catch {
    /* 存不下就算了:只影响续跑 */
  }
}

export function loadJob(chatId: string): BatchTagJob | null {
  if (!chatId) return null;
  const job = readAll()[chatId];
  return job && job.version === 1 && Array.isArray(job.floors) ? job : null;
}

export function saveJob(job: BatchTagJob): void {
  if (!job.chatId) return;
  const all = readAll();
  all[job.chatId] = { ...job, updatedAt: Date.now() };
  writeAll(all);
}

export function clearJob(chatId: string): void {
  const all = readAll();
  if (!(chatId in all)) return;
  delete all[chatId];
  writeAll(all);
}

export function createJob(chatId: string, floors: number[]): BatchTagJob {
  return {
    version: 1,
    chatId,
    floors,
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
