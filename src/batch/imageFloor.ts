import type { TagRunOutcome } from '@/autoTag/runner';
import { effectiveOrientation } from '@/backends/size';
import { cancelGen, slotKey } from '@/floor/genState';
import { isImageMissing } from '@/floor/missingImages';
import { generateSlot } from '@/floor/slotGenerate';
import { historyEntries, promptHash, readStore } from '@/floor/storage';
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

/** 本楼(当前 swipe)还没图的槽位序号。 */
export function pendingImageSeqs(message: STMessage | undefined): number[] {
  if (!isAiStoryMessage(message)) return [];
  const tags = parseImageTags(message.mes);
  if (!tags.length) return [];
  const store = readStore(message);
  const swipeId = message.swipe_id ?? 0;
  const pending: number[] = [];
  tags.forEach((tag, seq) => {
    const live = historyEntries(store, swipeId, promptHash(tag), seq).filter(entry => !isImageMissing(entry.path));
    if (!live.length) pending.push(seq);
  });
  return pending;
}

let current: string | null = null;

/** 停止批量时取消在途的那一张。 */
export function cancelCurrentImage(): void {
  if (current) cancelGen(current);
}

export async function runImageFloor(floor: number, signal: AbortSignal): Promise<TagRunOutcome> {
  const context = getContext();
  const chatId = context?.getCurrentChatId?.() ?? '';
  const message = context?.chat?.[floor];
  if (!context || !chatId || !message) return { kind: 'skipped' };
  const seqs = pendingImageSeqs(message);
  if (!seqs.length) return { kind: 'skipped' };

  let saved = 0;
  for (const seq of seqs) {
    if (signal.aborted) return saved ? { kind: 'written' } : { kind: 'aborted' };
    // 每张图开跑前现取:上一张出图期间用户可能改了提示词或换了 swipe
    const now = context.chat[floor];
    if (now !== message || context.getCurrentChatId() !== chatId) {
      return saved ? { kind: 'written' } : { kind: 'aborted' };
    }
    const tag = parseImageTags(now.mes)[seq];
    if (tag === undefined) continue;
    const content = parseImageTagContent(tag);
    const swipeId = now.swipe_id ?? 0;
    current = slotKey(chatId, floor, swipeId, seq);
    const result = await generateSlot({
      chatId,
      messageId: floor,
      swipeId,
      seq,
      tag,
      prompt: content.tag,
      nl: content.nl,
      negative: content.negative,
      characters: content.characters,
      size: effectiveOrientation(activeOrientationLock(), content.size),
    });
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
