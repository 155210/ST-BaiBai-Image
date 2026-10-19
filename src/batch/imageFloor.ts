import type { TagRunOutcome } from '@/autoTag/runner';
import type { BatchJob } from '@/batch/jobStore';
import { effectiveOrientation } from '@/backends/size';
import { cancelGen, slotKey } from '@/floor/genState';
import { isImageMissing } from '@/floor/missingImages';
import { generateSlot, type SlotJob } from '@/floor/slotGenerate';
import { historyEntries, promptHash, readStore, type BbiImageEntry } from '@/floor/storage';
import { activeOrientationLock } from '@/state/settings';
import { getContext, isAiStoryMessage, type STMessage } from '@/st/context';
import { parseImageTagContent, parseImageTags } from '@/st/imageTagRegex';

/**
 * 批量出图的单楼动作:给本楼「当前提示词还没出过图」的 tag 逐张出图。
 *
 * 判据与楼层卡片同口径:当前 tag 原文的 promptHash 在本楼 extra 里没有存活的历史 = 没图。
 * 只有旧提示词的图(改过提示词)也算没图——卡片上它显示为「旧图」,点生成才会出新图。
 * 出图本身走 floor/slotGenerate.ts,和点卡片上的「生成图片」完全同一条路。
 */

/**
 * 一个槽位的出图状态(当前 swipe):
 * has = 当前提示词有图;stale = 只有旧提示词的图(改过提示词);none = 没图。
 * 文件已确认被删(missingImages 册)的图不算,与卡片同口径。
 */
export type SlotImageState = 'has' | 'stale' | 'none';

/** 批量出图挑哪些槽位:all = 没图和旧提示词都出;none / stale = 只出其中一种。 */
export type ImageMode = NonNullable<BatchJob['mode']>;

export function slotImageState(message: STMessage, tag: string, seq: number): SlotImageState {
  const store = readStore(message);
  const swipeId = message.swipe_id ?? 0;
  const live = (entry: BbiImageEntry) => !!entry.path && !isImageMissing(entry.path);
  if (historyEntries(store, swipeId, promptHash(tag), seq).some(live)) return 'has';
  const bucket = store?.[String(swipeId)];
  if (!bucket) return 'none';
  const stale = Object.values(bucket).some(
    list => Array.isArray(list) && list.some(entry => (entry.slotSeq ?? 0) === seq && live(entry)),
  );
  return stale ? 'stale' : 'none';
}

/** 本楼(当前 swipe)还没图的槽位序号。 */
export function pendingImageSeqs(message: STMessage | undefined, mode: ImageMode = 'all'): number[] {
  if (!isAiStoryMessage(message)) return [];
  const tags = parseImageTags(message.mes);
  if (!tags.length) return [];
  const pending: number[] = [];
  tags.forEach((tag, seq) => {
    const state = slotImageState(message, tag, seq);
    if (state !== 'has' && (mode === 'all' || mode === state)) pending.push(seq);
  });
  return pending;
}

/** 按楼层里现在的 tag 组一个出图任务(与卡片「生成图片」同样的参数);tag 不在了返回 null。 */
export function slotJob(chatId: string, floor: number, message: STMessage, seq: number): SlotJob | null {
  const tag = parseImageTags(message.mes)[seq];
  if (tag === undefined) return null;
  const content = parseImageTagContent(tag);
  return {
    chatId,
    messageId: floor,
    swipeId: message.swipe_id ?? 0,
    seq,
    tag,
    prompt: content.tag,
    nl: content.nl,
    negative: content.negative,
    characters: content.characters,
    size: effectiveOrientation(activeOrientationLock(), content.size),
  };
}

let current: string | null = null;

/** 停止批量时取消在途的那一张。 */
export function cancelCurrentImage(): void {
  if (current) cancelGen(current);
}

export async function runImageFloor(
  floor: number,
  signal: AbortSignal,
  mode: ImageMode = 'all',
): Promise<TagRunOutcome> {
  const context = getContext();
  const chatId = context?.getCurrentChatId?.() ?? '';
  const message = context?.chat?.[floor];
  if (!context || !chatId || !message) return { kind: 'skipped' };
  const seqs = pendingImageSeqs(message, mode);
  if (!seqs.length) return { kind: 'skipped' };

  let saved = 0;
  for (const seq of seqs) {
    if (signal.aborted) return saved ? { kind: 'written' } : { kind: 'aborted' };
    // 每张图开跑前现取:上一张出图期间用户可能改了提示词或换了 swipe
    const now = context.chat[floor];
    if (now !== message || context.getCurrentChatId() !== chatId) {
      return saved ? { kind: 'written' } : { kind: 'aborted' };
    }
    const job = slotJob(chatId, floor, now, seq);
    if (!job) continue;
    current = slotKey(chatId, floor, job.swipeId, seq);
    const result = await generateSlot(job);
    current = null;
    if (result.kind === 'saved') saved++;
    else if (result.kind === 'failed') {
      return { kind: 'failed', reason: `第 ${seq + 1} 张：${result.error}${saved ? `（本楼已出 ${saved} 张）` : ''}` };
    } else {
      return saved ? { kind: 'written' } : { kind: 'aborted' };
    }
  }
  return saved ? { kind: 'written' } : { kind: 'skipped' };
}
