import { slotImageState, slotJob, type SlotImageState } from '@/batch/imageFloor';
import { backendStatus } from '@/generate';
import { getGenRecord, slotKey, type GenRecord } from '@/floor/genState';
import { generateSlot } from '@/floor/slotGenerate';
import { confirmImageMissing, isImageMissing } from '@/floor/missingImages';
import { confirmDialog } from '@/components/confirm';
import { hydrateMessage } from '@/floor/hydrate';
import {
  deleteImageResult,
  historyEntries,
  latestStaleEntry,
  promptHash,
  readStore,
  type BbiImageEntry,
} from '@/floor/storage';
import { closePanel } from '@/state/ui';
import { getContext, isAiStoryMessage, type STContext, type STMessage } from '@/st/context';
import { parseImageTagContent, parseImageTags, type ImageTagContent } from '@/st/imageTagRegex';

/**
 * 批量页「图片浏览」:按楼层范围列出每个 tag 槽位(一个 tag = 一张卡片)和它的图。
 * 全部从聊天数据算,不需要楼层显示在页面上;操作走与楼层卡片同一套函数。
 */

export interface GallerySlot {
  floor: number;
  seq: number;
}

export type GalleryFilter = 'all' | SlotImageState;
export type GallerySize = 'l' | 'm' | 's';

/** 大 = 一行 1 张,中 = 一行 2 张,小 = 一行 3 张;每页张数随档位变。 */
export const GALLERY_SIZES: Record<GallerySize, { cols: number; page: number; label: string }> = {
  l: { cols: 1, page: 8, label: '大' },
  m: { cols: 2, page: 12, label: '中' },
  s: { cols: 3, page: 18, label: '小' },
};

/** 范围内有 tag 的 AI 楼,每个 tag 一个槽位。 */
export function listSlots(chat: STMessage[], floors: number[]): GallerySlot[] {
  return floors.flatMap(floor => {
    const message = chat[floor];
    if (!isAiStoryMessage(message)) return [];
    return parseImageTags(message.mes).map((_, seq) => ({ floor, seq }));
  });
}

export interface SlotView {
  floor: number;
  seq: number;
  swipeId: number;
  /** tag 原文(含 <bbi_image> 壳)。 */
  tag: string;
  content: ImageTagContent;
  state: SlotImageState;
  /** 当前提示词的图(文件还在的),时间正序。 */
  history: BbiImageEntry[];
  /** 没有当前提示词的图时,旧提示词最新的那张。 */
  stale: BbiImageEntry | null;
}

/** 现读一个槽位;楼没了或 tag 少了返回 null。 */
export function readSlot(chat: STMessage[], slot: GallerySlot): SlotView | null {
  const message = chat[slot.floor];
  if (!isAiStoryMessage(message)) return null;
  const tag = parseImageTags(message.mes)[slot.seq];
  if (tag === undefined) return null;
  const swipeId = message.swipe_id ?? 0;
  const store = readStore(message);
  const hash = promptHash(tag);
  const alive = (entry: BbiImageEntry | null) => !!entry?.path && !isImageMissing(entry.path);
  const history = historyEntries(store, swipeId, hash, slot.seq).filter(alive);
  const staleEntry = latestStaleEntry(store, swipeId, hash, slot.seq);
  return {
    ...slot,
    swipeId,
    tag,
    content: parseImageTagContent(tag),
    state: slotImageState(message, tag, slot.seq),
    history,
    stale: !history.length && alive(staleEntry) ? staleEntry : null,
  };
}

export function filterSlots(
  chat: STMessage[],
  slots: GallerySlot[],
  filter: GalleryFilter,
  reverse: boolean,
): GallerySlot[] {
  const list = filter === 'all' ? slots : slots.filter(slot => readSlot(chat, slot)?.state === filter);
  return reverse ? [...list].reverse() : list;
}

/** 查过的文件(不论在不在)不重复查。 */
const checked = new Set<string>();

/**
 * 逐个问服务器这些图片文件还在不在(HEAD,不下载图片)。确认 404 的记进 missingImages 册,
 * 楼层卡片与这里都会按「没图」算(多半是在图库里删掉的)。网络出错一律当它还在。
 */
export async function checkSlotFiles(chat: STMessage[], slots: GallerySlot[]): Promise<number> {
  const paths = new Set<string>();
  for (const slot of slots) {
    const message = chat[slot.floor];
    const bucket = message ? readStore(message)?.[String(message.swipe_id ?? 0)] : undefined;
    if (!bucket) continue;
    for (const list of Object.values(bucket)) {
      for (const entry of list) {
        if ((entry.slotSeq ?? 0) === slot.seq && entry.path && !checked.has(entry.path)) paths.add(entry.path);
      }
    }
  }
  const queue = [...paths];
  let gone = 0;
  const worker = async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      if (await confirmImageMissing(path)) gone++;
      checked.add(path);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  return gone;
}

/** 关掉柏宝绘窗口,交给 ST 自己的 /chat-jump 跳到那一楼(没显示出来的旧楼它会自己加载)。 */
export async function jumpToFloor(floor: number): Promise<void> {
  const context = getContext() as
    | (STContext & { executeSlashCommandsWithOptions?: (text: string) => Promise<unknown> })
    | null;
  if (!context?.executeSlashCommandsWithOptions) {
    toastr.warning('这个版本的酒馆不支持跳转楼层', '柏宝绘');
    return;
  }
  closePanel();
  try {
    await context.executeSlashCommandsWithOptions(`/chat-jump ${floor}`);
  } catch (error) {
    console.warn('[柏宝绘] 跳转楼层失败', error);
    toastr.warning(`没能跳到第 ${floor} 楼`, '柏宝绘');
  }
}

/** 卡片和大图上显示的进度字样。 */
export function busyLabel(record: GenRecord | undefined): string {
  if (!record) return '';
  if (record.retry) return `受限，等第 ${record.retry.attempt}/${record.retry.max} 次重试`;
  return record.phase === 'queued' ? '排队中…' : '生成中…';
}

/** 生成中 / 排队中:这时不能再点重roll 或编辑。 */
export function isSlotBusy(chatId: string, view: SlotView): boolean {
  const phase = getGenRecord(slotKey(chatId, view.floor, view.swipeId, view.seq))?.phase;
  return phase === 'queued' || phase === 'generating';
}

/** 重roll:按楼层里现在的 tag 出一张新图,与卡片上的「重绘 / 生成图片」同一条路。 */
export async function regenerateSlot(floor: number, seq: number): Promise<void> {
  const status = backendStatus();
  if (!status.configured) {
    toastr.warning(status.reason || '出图渠道还没配好', '柏宝绘');
    return;
  }
  const context = getContext();
  const chatId = context?.getCurrentChatId?.() ?? '';
  const message = context?.chat?.[floor];
  if (!chatId || !message) return;
  const job = slotJob(chatId, floor, message, seq);
  if (!job) return;
  const phase = getGenRecord(slotKey(chatId, floor, job.swipeId, seq))?.phase;
  if (phase === 'queued' || phase === 'generating') return;
  await generateSlot(job);
}

/** 删一张图(与卡片上的删除同一套:先确认,删记录和 images 里的文件)。 */
export async function deleteSlotImage(floor: number, swipeId: number, entry: BbiImageEntry): Promise<void> {
  const ok = await confirmDialog({
    title: '删除这张图',
    text: '将删除这张图的聊天记录，无法恢复；images 中的文件会一并删除，files 中的旧图保留。同一提示词的其它历史结果不受影响。',
    confirmText: '删除',
    tone: 'danger',
  });
  if (!ok) return;
  // 旧提示词的图在别的 hash 桶里,要用它自己的 promptHash
  const removed = await deleteImageResult(floor, swipeId, promptHash(entry.prompt), entry.generationId);
  if (!removed) {
    toastr.error('删除失败,聊天记录未能保存', '柏宝绘');
    return;
  }
  const context = getContext();
  if (context) hydrateMessage(floor, context);
}
