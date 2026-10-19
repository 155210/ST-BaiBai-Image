import { h, reactive, render } from 'vue';

import { deleteSlotImage, readSlot, regenerateSlot, type GallerySlot, type SlotView } from '@/batch/gallery';
import { imageDownloadFileName } from '@/floor/download';
import { cancelGen, getGenRecord, slotKey } from '@/floor/genState';
import { closeLightbox, openLightbox } from '@/floor/lightbox';
import type { BbiImageEntry } from '@/floor/storage';
import { formatGenerationMeta } from '@/generationMeta';
import type { LightboxNav } from '@/lightboxNav/types';
import EmptySlotView from '@/pages/batch/EmptySlotView.vue';
import { getContext } from '@/st/context';
import { formatPromptText } from '@/st/imageTagRegex';

/**
 * 图片浏览里点开大图:两侧有「上一张 / 下一张」,按当前筛选和顺序在卡片之间切换,翻页也跟着走。
 * 切到还没有图的卡片时显示「还没有图」和生成按钮,生成好了自动换成大图。
 */

const HOST_ID = 'bbi-app-host';

/** 卡片要显示的那张:当前提示词最新一张,没有就用旧提示词那张。 */
function slotImage(view: SlotView | null): BbiImageEntry | null {
  return view ? (view.history.at(-1) ?? view.stale) : null;
}

/** 第 index 张的左右邻居(纯函数,便于单测)。 */
export function neighbours(length: number, index: number): { prev?: number; next?: number } {
  return {
    prev: index > 0 ? index - 1 : undefined,
    next: index < length - 1 ? index + 1 : undefined,
  };
}

export interface GalleryLightboxOptions {
  list: GallerySlot[];
  index: number;
  /** 卡片上正在看的那张(翻历史时不一定是最新);切到别的卡片后用它们各自最新的。 */
  entry?: BbiImageEntry;
  /** 切换后告诉图片浏览跟到对应的卡片(翻页)。 */
  onShow?: (index: number) => void;
}

function promptOf(view: SlotView): string {
  const { content } = view;
  return formatPromptText({
    tag: content.tag,
    nl: content.nl,
    negative: content.negative,
    characters: content.characters,
  });
}

/* ---------- 没图的卡片 ---------- */

let closeEmpty: (() => void) | null = null;

function openEmpty(options: GalleryLightboxOptions, view: SlotView, nav: LightboxNav): void {
  const root = document.getElementById(HOST_ID)?.shadowRoot;
  const context = getContext();
  if (!root || !context) return;
  closeEmpty?.();
  const chatId = context.getCurrentChatId?.() ?? '';
  const key = slotKey(chatId, view.floor, view.swipeId, view.seq);
  const state = reactive({ busy: false, busyText: '', error: '' });
  const container = document.createElement('div');
  root.appendChild(container);

  // 生成状态在 genState 里(不是本组件的),定时读一下;图出来了就换成大图
  const refresh = () => {
    const record = getGenRecord(key);
    state.busy = record?.phase === 'queued' || record?.phase === 'generating';
    state.busyText = record?.retry
      ? `受限，等第 ${record.retry.attempt}/${record.retry.max} 次重试`
      : record?.phase === 'queued'
        ? '排队中…'
        : '生成中…';
    state.error = record?.phase === 'error' ? record.error || '生成失败' : '';
    const now = context.chat ? readSlot(context.chat, options.list[options.index]!) : null;
    if (!state.busy && slotImage(now)) openGalleryLightbox({ ...options, entry: undefined });
  };
  const timer = setInterval(refresh, 800);

  const close = () => {
    if (closeEmpty !== close) return;
    closeEmpty = null;
    clearInterval(timer);
    render(null, container);
    container.remove();
  };
  closeEmpty = close;

  render(
    h(EmptySlotView, {
      nav,
      title: nav.label ?? '',
      state,
      prompt: promptOf(view),
      onClose: close,
      onGenerate: () => {
        state.busy = true;
        state.busyText = '生成中…';
        void regenerateSlot(view.floor, view.seq).finally(() => {
          if (closeEmpty === close) refresh();
        });
      },
      onCancel: () => cancelGen(key),
    }),
    container,
  );
  refresh();
}

/* ---------- 入口 ---------- */

export function openGalleryLightbox(options: GalleryLightboxOptions): void {
  const context = getContext();
  const chat = context?.chat;
  if (!chat) return;
  const { list, index } = options;
  const slot = list[index];
  if (!slot) return;
  const view = readSlot(chat, slot);
  if (!view) return;

  const { prev, next } = neighbours(list.length, index);
  const go = (target: number) => () => {
    options.onShow?.(target);
    openGalleryLightbox({ list, index: target, onShow: options.onShow });
  };
  const nav: LightboxNav = {
    prev: prev === undefined ? undefined : go(prev),
    next: next === undefined ? undefined : go(next),
    label: `#${view.floor}${view.seq ? ` 第${view.seq + 1}张` : ''} · ${index + 1} / ${list.length}`,
  };

  const entry = options.entry ?? slotImage(view);
  if (!entry) {
    closeLightbox();
    openEmpty(options, view, nav);
    return;
  }
  closeEmpty?.();
  const characterName = chat[view.floor]?.name || context.name2 || '';
  const target = { floor: view.floor, swipeId: view.swipeId };
  openLightbox({
    src: entry.path,
    prompt: [promptOf(view), entry.meta ? formatGenerationMeta(entry.meta) : ''].filter(Boolean).join('\n\n'),
    filename: imageDownloadFileName(entry.path, characterName, entry.generationId),
    onDelete: () => void deleteSlotImage(target.floor, target.swipeId, entry),
    nav,
  });
}
