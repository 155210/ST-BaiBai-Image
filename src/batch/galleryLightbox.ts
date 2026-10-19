import { deleteSlotImage, readSlot, type GallerySlot } from '@/batch/gallery';
import { imageDownloadFileName } from '@/floor/download';
import { openLightbox } from '@/floor/lightbox';
import type { BbiImageEntry } from '@/floor/storage';
import { formatGenerationMeta } from '@/generationMeta';
import { getContext, type STMessage } from '@/st/context';
import { formatPromptText } from '@/st/imageTagRegex';

/**
 * 图片浏览里点开大图:灯箱两侧有「上一张 / 下一张」,按当前筛选和顺序在有图的卡片之间切换,
 * 翻页也跟着走。没图的卡片跳过。
 */

/** 卡片要显示的那张:当前提示词最新一张,没有就用旧提示词那张。 */
function slotImage(chat: STMessage[], slot: GallerySlot): BbiImageEntry | null {
  const view = readSlot(chat, slot);
  return view ? (view.history.at(-1) ?? view.stale) : null;
}

/** 有图的卡片在 list 里的下标(纯函数,便于单测)。 */
export function imageIndexes(list: GallerySlot[], hasImage: (slot: GallerySlot) => boolean): number[] {
  const out: number[] = [];
  list.forEach((slot, index) => {
    if (hasImage(slot)) out.push(index);
  });
  return out;
}

export interface GalleryLightboxOptions {
  list: GallerySlot[];
  index: number;
  /** 卡片上正在看的那张(翻历史时不一定是最新);切到别的卡片后用它们各自最新的。 */
  entry?: BbiImageEntry;
  /** 切换后告诉图片浏览跟到对应的卡片(翻页)。 */
  onShow?: (index: number) => void;
}

export function openGalleryLightbox(options: GalleryLightboxOptions): void {
  const context = getContext();
  const chat = context?.chat;
  if (!chat) return;
  const { list, index } = options;
  const slot = list[index];
  if (!slot) return;
  const view = readSlot(chat, slot);
  const entry = options.entry ?? (view ? (view.history.at(-1) ?? view.stale) : null);
  if (!view || !entry) return;

  const withImage = imageIndexes(list, slot => !!slotImage(chat, slot));
  const at = withImage.indexOf(index);
  const prev = at > 0 ? withImage[at - 1] : undefined;
  const next = at >= 0 && at < withImage.length - 1 ? withImage[at + 1] : undefined;
  const go = (target: number) => () => {
    options.onShow?.(target);
    openGalleryLightbox({ list, index: target, onShow: options.onShow });
  };

  const { content } = view;
  const prompt = formatPromptText({
    tag: content.tag,
    nl: content.nl,
    negative: content.negative,
    characters: content.characters,
  });
  const characterName = chat[view.floor]?.name || context.name2 || '';
  const target = { floor: view.floor, swipeId: view.swipeId };
  openLightbox({
    src: entry.path,
    prompt: [prompt, entry.meta ? formatGenerationMeta(entry.meta) : ''].filter(Boolean).join('\n\n'),
    filename: imageDownloadFileName(entry.path, characterName, entry.generationId),
    onDelete: () => void deleteSlotImage(target.floor, target.swipeId, entry),
    nav: {
      prev: prev === undefined ? undefined : go(prev),
      next: next === undefined ? undefined : go(next),
      label: at >= 0 ? `#${view.floor} · ${at + 1} / ${withImage.length}` : `#${view.floor}`,
    },
  });
}
