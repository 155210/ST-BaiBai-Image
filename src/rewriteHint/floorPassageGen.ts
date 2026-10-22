import { h, render } from 'vue';

import { requestFocusedTags } from '@/autoTag/runner';
import { ensureChatObserver, onChatMutation } from '@/floor/chatObserver';
import { backendStatus } from '@/generate';
import { getContext, isAiStoryMessage } from '@/st/context';
import { hasImageTagTrace, parseImageTags } from '@/st/imageTagRegex';
import { isCurrentChatExcluded, settings } from '@/state/settings';

import { normalizeRewriteHint } from './hint';
import { floorPassages, passageGroupsHint } from './passage';
import PassageGenDialog from './PassageGenDialog.vue';

/**
 * 楼层上的「挑一段生图」(本 fork 独有)。
 *
 * 楼层「⋯」按钮区里、上游调色板按钮旁再放一颗:点开列出本楼段落,点选后 AI 只为这几段
 * 写 1 张图的 tag,写回正文并直接出图(runner 的 focus 选项)。
 * 已有图的楼同一颗按钮是「再加一张」:新图插到所选段落后面,原来的图一张不动(runner 的 add 选项)。
 * 想换掉某一张,在那张卡片「编辑」→「挑正文里的一段」。
 */

const BUTTON_CLASS = 'bbi-passage-gen-action';
const TITLE_NEW = '挑段落生图（可分几组，每组一张）';
const TITLE_ADD = '再加图（挑段落，可分几组，原来的图不动）';
const ICON_CLASS = 'fa-crop-simple';
// 与 index.ts 的 HOST_ID 一致
const HOST_ID = 'bbi-app-host';
const LEAVE_MS = 160;

let bound = false;
let closeCurrent: (() => void) | null = null;

function setRunning(button: HTMLElement, running: boolean): void {
  button.dataset.running = running ? '1' : '';
  button.classList.toggle(ICON_CLASS, !running);
  button.classList.toggle('fa-spinner', running);
  button.classList.toggle('fa-spin', running);
}

/** 打开挑段落弹窗;选好后跑 onSubmit(弹窗先关,写 tag 与出图在后台继续)。 */
export function openPassageGenDialog(floor: number, onSubmit: (hint: string) => void, existing = 0): void {
  const root = document.getElementById(HOST_ID)?.shadowRoot;
  if (!root) return;
  closeCurrent?.();
  const passages = floorPassages(floor);
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
      h(PassageGenDialog, {
        floor,
        passages,
        existing,
        configured: backendStatus().configured,
        closing,
        onClose: close,
        onSubmit: (groups: string[][], extra: string) => {
          if (closing) return;
          const chosen = groups.map(ids => passages.filter(p => ids.includes(p.id)));
          // 段落那几行不截断(分组多时会超过要求的字数上限),只截用户另写的要求
          const hint = [passageGroupsHint(chosen), normalizeRewriteHint(extra)].filter(s => s.trim()).join('\n');
          close();
          if (hint) onSubmit(hint);
        },
      }),
      container,
    );
  };
  paint();
}

function onActivate(button: HTMLElement): void {
  if (button.dataset.running === '1') return;
  const floor = Number(button.closest('.mes')?.getAttribute('mesid'));
  const message = Number.isInteger(floor) ? getContext()?.chat?.[floor] : undefined;
  if (!message) {
    toastr.warning('找不到这一楼的消息，请刷新页面后重试', '柏宝绘');
    return;
  }
  if (!settings.enabled) {
    toastr.warning('柏宝绘已停用，请先在插件设置里开启', '柏宝绘');
    return;
  }
  // 已有图:再加一张,原来的图不动
  const existing = parseImageTags(message.mes ?? '').length;
  const add = existing > 0 || hasImageTagTrace(message.mes ?? '');
  openPassageGenDialog(
    floor,
    hint => {
      setRunning(button, true);
      void requestFocusedTags(floor, hint, add).finally(() => setRunning(button, false));
    },
    existing,
  );
}

function createButton(): HTMLDivElement {
  const button = document.createElement('div');
  button.className = `mes_button fa-solid ${ICON_CLASS} ${BUTTON_CLASS}`;
  button.title = TITLE_NEW;
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

/** 与上游 actionButton.ts 同一套对账:该有的补、该撤的撤;正在跑的那颗不撤。 */
function syncButtons(): void {
  const chat = getContext()?.chat;
  if (!chat) return;
  const excluded = isCurrentChatExcluded();
  for (const mesEl of document.querySelectorAll<HTMLElement>('#chat .mes')) {
    const extra = mesEl.querySelector('.extraMesButtons');
    if (!extra) continue;
    const floor = Number(mesEl.getAttribute('mesid'));
    const message = Number.isInteger(floor) ? chat[floor] : undefined;
    const wanted = !excluded && isAiStoryMessage(message);
    let existing = extra.querySelector<HTMLElement>(`.${BUTTON_CLASS}`);
    if (wanted && !existing) existing = extra.appendChild(createButton());
    else if (!wanted && existing && existing.dataset.running !== '1') existing.remove();
    if (wanted && existing) {
      const title = hasImageTagTrace(message?.mes ?? '') ? TITLE_ADD : TITLE_NEW;
      if (existing.title !== title) existing.title = title;
    }
  }
}

export function bindPassageGenButtons(): boolean {
  if (bound) return true;
  if (!ensureChatObserver()) return false;
  bound = true;
  onChatMutation(syncButtons);
  syncButtons();
  return true;
}
