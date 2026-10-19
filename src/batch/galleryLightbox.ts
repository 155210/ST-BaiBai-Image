import { h, reactive, render } from 'vue';

import { busyLabel, deleteSlotImage, readSlot, regenerateSlot, type GallerySlot, type SlotView } from '@/batch/gallery';
import { imageDownloadFileName } from '@/floor/download';
import { cancelFloorTags } from '@/autoTag/runner';
import { cancelGen, getGenRecord, slotKey } from '@/floor/genState';
import { isTagPlanning } from '@/floor/tagPlanState';
import { closeLightbox, openLightbox } from '@/floor/lightbox';
import type { BbiImageEntry } from '@/floor/storage';
import { openPromptEditor } from '@/floor/promptEditor';
import { backendStatus } from '@/generate';
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
    state.busyText = busyLabel(record) || '生成中…';
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

/** 有弹窗(编辑提示词、删除确认)开着。 */
function modalOpen(): boolean {
  return !!document.getElementById(HOST_ID)?.shadowRoot?.querySelector('.bbi-modal-mask');
}

/**
 * 作者的灯箱 z-index 是 10050,比所有弹窗(10001 / 10002)都高,在大图上点删除或编辑时
 * 确认框和编辑框会被压在下面。图片浏览的大图降到 10001:仍盖住插件窗口(10000),
 * 后开的弹窗插在它后面、同级或更高,就能盖在大图上面。
 */
function lowerLightbox(): void {
  const all = document.getElementById(HOST_ID)?.shadowRoot?.querySelectorAll<HTMLElement>('.bbi-lightbox');
  const last = all?.[all.length - 1];
  if (last) last.style.zIndex = '10001';
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
  // 「重新生成中」画面只带切卡片的箭头和标题,别把 roll 箭头、删除、状态轮询带过去
  const plainNav: LightboxNav = { prev: nav.prev, next: nav.next, label: nav.label };
  // 大图上的「重新生成」:和卡片上的 ↻ 同一条路,出完自动换成新图
  nav.regenerate = () => {
    closeLightbox();
    openEmpty(options, view, plainNav, true);
  };
  // 大图上的「编辑」:和卡片上的 ✎ 同一个弹窗;「应用并重绘」回到大图看进度,出完换新图
  nav.edit = () => {
    openPromptEditor({
      at: { chatId: context.getCurrentChatId?.() ?? '', messageId: view.floor, swipeId: view.swipeId, seq: view.seq, rawTag: view.tag },
      content: { ...view.content, characters: view.content.characters.map(character => ({ ...character })) },
      historyCount: view.history.length,
      configured: backendStatus().configured,
      // 大图一直开着:出图进度显示在左上,出完自动换新图(见下面的 poll)
      regenerate: () => void regenerateSlot(view.floor, view.seq),
    });
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
  // 删除:只删现在看的这一次。确认框盖在大图上面,删完留在这张卡片、停在原来的位置
  nav.menu = [
    {
      label: rolls.length > 1 ? `🗑 删除这一次（第 ${at + 1}/${rolls.length} 次）` : '🗑 删除这张图',
      danger: true,
      action: () => {
        void deleteSlotImage(view.floor, view.swipeId, entry, { index: at, total: rolls.length }).then(deleted => {
          if (!deleted) return;
          const fresh = readSlot(getContext()?.chat ?? [], slot);
          const left = fresh?.history ?? [];
          openGalleryLightbox({ list, index, onShow: options.onShow, entry: left[Math.min(at, left.length - 1)] });
        });
      },
    },
  ];
  // 这张卡片正在生成(从聊天楼层、卡片或批量发起的都算):左上显示进度和取消,出完换成新图
  const key = slotKey(context.getCurrentChatId?.() ?? '', view.floor, view.swipeId, view.seq);
  const before = slotImage(view)?.generationId ?? '';
  let waiting = false;
  nav.poll = () => {
    // 编辑框 / 删除确认开着时先不动,免得新开的大图盖住它
    if (modalOpen()) return null;
    // 提示词被改了(大图上点了编辑并应用):编辑框关掉后换成新提示词的样子
    const now = readSlot(getContext()?.chat ?? [], slot);
    if (now && now.tag !== view.tag) {
      openGalleryLightbox({ list, index, onShow: options.onShow });
      return null;
    }
    if (isTagPlanning(key)) {
      waiting = true;
      return { text: 'AI 重写提示词中…', cancel: () => cancelFloorTags(view.floor) };
    }
    const record = getGenRecord(key);
    if (record?.phase === 'queued' || record?.phase === 'generating') {
      waiting = true;
      return { text: busyLabel(record), cancel: () => cancelGen(key) };
    }
    if (waiting) {
      waiting = false;
      const now = slotImage(readSlot(getContext()?.chat ?? [], slot));
      if (now && now.generationId !== before) {
        openGalleryLightbox({ list, index, onShow: options.onShow });
        return null;
      }
    }
    return record?.phase === 'error' ? { text: `生成失败：${record.error || '未知原因'}`, error: true } : null;
  };
  const characterName = chat[view.floor]?.name || context.name2 || '';
  openLightbox({
    src: entry.path,
    prompt: [promptOf(view), entry.meta ? formatGenerationMeta(entry.meta) : ''].filter(Boolean).join('\n\n'),
    filename: imageDownloadFileName(entry.path, characterName, entry.generationId),
    // 不给 onDelete:作者灯箱栏上的垃圾桶不显示,删除只在「⋯」里
    nav,
  });
  lowerLightbox();
}
