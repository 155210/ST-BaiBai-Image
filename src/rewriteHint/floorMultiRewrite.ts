import { mesToSync } from '@/longChat/dirty';
import { h, render } from 'vue';

import { requestManySlotTags } from '@/autoTag/runner';
import { onChatMutation } from '@/floor/chatObserver';
import { backendStatus } from '@/generate';
import { getContext, isAiStoryMessage } from '@/st/context';
import { parseImageTags } from '@/st/imageTagRegex';
import { isCurrentChatExcluded, settings } from '@/state/settings';

import { slotThumb } from './floorPassageGen';
import MultiRewriteDialog from './MultiRewriteDialog.vue';
import { setSlotNoNl, slotNoNl } from '@/nlSwitch/perSlot';
import type { SlotEdit } from './multiRewrite';

/**
 * 楼层「⋯」里的「一起改这层的图」(本 fork 独有):列出本楼每张图,各写修改要求,
 * 一次发给 AI 一起改写提示词,写回后这几张一起重出。留空的那张不动。
 */

const BUTTON_CLASS = 'bbi-multi-rewrite-action';
const ICON_CLASS = 'fa-pen-to-square';
const TITLE = '一起改这层的图（每张写修改要求，一次发给 AI）';
// 与 index.ts 的 HOST_ID 一致
const HOST_ID = 'bbi-app-host';
const LEAVE_MS = 160;

let closeCurrent: (() => void) | null = null;

export interface SlotItem {
  seq: number;
  src?: string;
  /** 这张出图不发自然语言(nlSwitch/perSlot.ts) */
  noNl: boolean;
}

function setRunning(button: HTMLElement, running: boolean): void {
  button.dataset.running = running ? '1' : '';
  button.classList.toggle(ICON_CLASS, !running);
  button.classList.toggle('fa-spinner', running);
  button.classList.toggle('fa-spin', running);
}

function openDialog(floor: number, items: SlotItem[], onSubmit: (edits: SlotEdit[], noNl: boolean[]) => void): void {
  const root = document.getElementById(HOST_ID)?.shadowRoot;
  if (!root) return;
  closeCurrent?.();
  const container = document.createElement('div');
  root.appendChild(container);
  let closing = false;
  let closed = false;
  const close = () => {
    if (closeCurrent !== close) return;
    closeCurrent = null;
    closing = true;
    paint();
    setTimeout(() => {
      closed = true;
      render(null, container);
      container.remove();
    }, LEAVE_MS);
  };
  closeCurrent = close;
  const paint = () => {
    if (closed) return;
    render(
      h(MultiRewriteDialog, {
        floor,
        items,
        configured: backendStatus().configured,
        closing,
        onClose: close,
        onSubmit: (edits: SlotEdit[], noNl: boolean[]) => {
          if (closing) return;
          close();
          onSubmit(edits, noNl);
        },
      }),
      container,
    );
  };
  paint();
}

function onActivate(button: HTMLElement): void {
  if (button.dataset.running === '1') return;
  openMultiRewriteFor(Number(button.closest('.mes')?.getAttribute('mesid')), button);
}

/** 按楼号打开(楼层按钮、批量页「单楼操作」共用);button 给了就在上面转圈。 */
export function openMultiRewriteFor(floor: number, button?: HTMLElement): void {
  const message = Number.isInteger(floor) ? getContext()?.chat?.[floor] : undefined;
  if (!message) {
    toastr.warning('找不到这一楼的消息，请刷新页面后重试', '柏宝绘');
    return;
  }
  if (!settings.enabled) {
    toastr.warning('柏宝绘已停用，请先在插件设置里开启', '柏宝绘');
    return;
  }
  const at = { chatId: getContext()?.getCurrentChatId?.() ?? '', messageId: floor, swipeId: message.swipe_id ?? 0 };
  const items = parseImageTags(message.mes ?? '').map((_raw, seq) => ({
    seq,
    src: slotThumb(floor, seq),
    noNl: slotNoNl({ ...at, seq }),
  }));
  if (!items.length) {
    toastr.info('本楼还没有图', '柏宝绘');
    return;
  }
  openDialog(floor, items, (edits, noNl) => {
    items.forEach((item, i) => setSlotNoNl({ ...at, seq: item.seq }, noNl[i] ?? false));
    if (button) setRunning(button, true);
    void requestManySlotTags(floor, edits).finally(() => button && setRunning(button, false));
  });
}

function createButton(): HTMLDivElement {
  const button = document.createElement('div');
  button.className = `mes_button fa-solid ${ICON_CLASS} ${BUTTON_CLASS}`;
  button.title = TITLE;
  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', '0');
  const activate = () => onActivate(button);
  button.addEventListener('click', activate);
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  return button;
}

/** 有图的剧情楼才给;正在跑的那颗不撤。 */
function syncButtons(): void {
  const chat = getContext()?.chat;
  if (!chat) return;
  const excluded = isCurrentChatExcluded();
  for (const mesEl of mesToSync()) { // fork:长聊天只看变过的楼
    const extra = mesEl.querySelector('.extraMesButtons');
    if (!extra) continue;
    const floor = Number(mesEl.getAttribute('mesid'));
    const message = Number.isInteger(floor) ? chat[floor] : undefined;
    const wanted = !excluded && isAiStoryMessage(message) && parseImageTags(message?.mes ?? '').length > 0;
    const existing = extra.querySelector<HTMLElement>(`.${BUTTON_CLASS}`);
    if (wanted && !existing) extra.appendChild(createButton());
    else if (!wanted && existing && existing.dataset.running !== '1') existing.remove();
  }
}

let bound = false;

/** 跟着「挑一段生图」按钮一起绑定(共用 #chat 观察器)。 */
export function bindMultiRewriteButtons(): void {
  if (bound) return;
  bound = true;
  onChatMutation(syncButtons);
  syncButtons();
}
