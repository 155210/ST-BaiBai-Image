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
 * 图片浏览里点开大图:两侧大箭头按当前筛选和顺序在卡片之间切换,翻页也跟着走;
 * 左上角小箭头切同一张卡片出过的几次图,「⋯」里能只删现在看的这一次。
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

/**
 * 「还没有图」/「重新生成中」画面。regen = 从大图点了「重新生成」:马上开始出图,
 * 等新图出来(最新一张换了)再切回大图;旧图一直留着,失败了可以回去看旧图。
 */
function openEmpty(options: GalleryLightboxOptions, view: SlotView, nav: LightboxNav, regen = false): void {
  const root = document.getElementById(HOST_ID)?.shadowRoot;
  const context = getContext();
  if (!root || !context) return;
  closeEmpty?.();
  const chatId = context.getCurrentChatId?.() ?? '';
  const key = slotKey(chatId, view.floor, view.swipeId, view.seq);
  const state = reactive({ busy: false, busyText: '', error: '' });
  const latestId = () => {
    const now = context.chat ? readSlot(context.chat, options.list[options.index]!) : null;
    return slotImage(now)?.generationId ?? '';
  };
  const before = regen ? latestId() : '';
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
    const id = latestId();
    if (!state.busy && id && id !== before) openGalleryLightbox({ ...options, entry: undefined });
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

  const generate = () => {
    state.busy = true;
    state.busyText = '生成中…';
    state.error = '';
    void regenerateSlot(view.floor, view.seq).finally(() => {
      if (closeEmpty === close) refresh();
    });
  };

  render(
    h(EmptySlotView, {
      nav,
      title: nav.label ?? '',
      state,
      prompt: promptOf(view),
      onClose: close,
      regen,
      onGenerate: generate,
      onCancel: () => cancelGen(key),
      // 重新生成失败或取消后回去看旧图
      onBack: () => openGalleryLightbox({ ...options, entry: undefined }),
    }),
    container,
  );
  if (regen) generate();
  else refresh();
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
  // 大图上的「重新生成」:和卡片上的 ↻ 同一条路,出完自动换成新图
  nav.regenerate = () => {
    closeLightbox();
    openEmpty(options, view, { ...nav, regenerate: undefined }, true);
  };
  // 同一张卡片的历史 roll:小箭头在左上角,和切卡片的两侧大箭头分开
  const rolls = view.history.length ? view.history : [entry];
  const at = Math.max(0, rolls.findIndex(item => item.generationId === entry.generationId));
  const showRoll = (target: number) => () => openGalleryLightbox({ ...options, entry: rolls[target] });
  nav.rolls = {
    index: at,
    total: rolls.length,
    prev: at > 0 ? showRoll(at - 1) : undefined,
    next: at < rolls.length - 1 ? showRoll(at + 1) : undefined,
  };
  // 删除收进「⋯」:只删现在看的这一次,删完留在这张卡片上
  nav.menu = [
    {
      label: rolls.length > 1 ? `删除这一次（第 ${at + 1}/${rolls.length} 次）` : '删除这张图',
      danger: true,
      action: () => {
        closeLightbox();
        void deleteSlotImage(view.floor, view.swipeId, entry).then(() =>
          openGalleryLightbox({ list, index, onShow: options.onShow }),
        );
      },
    },
  ];
  const characterName = chat[view.floor]?.name || context.name2 || '';
  openLightbox({
    src: entry.path,
    prompt: [promptOf(view), entry.meta ? formatGenerationMeta(entry.meta) : ''].filter(Boolean).join('\n\n'),
    filename: imageDownloadFileName(entry.path, characterName, entry.generationId),
    // 不给 onDelete:作者灯箱栏上的垃圾桶不显示,删除只在「⋯」里
    nav,
  });
}
