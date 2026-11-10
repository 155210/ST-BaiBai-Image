import { bindLongChatRender } from '@/longChat/render';
import { mesToSync } from '@/longChat/dirty';
import { bindFloorMenu } from '@/floorMenu/menu';
import { h, render } from 'vue';

import { requestFocusedTags, type TagRunOutcome } from '@/autoTag/runner';
import { ensureChatObserver, onChatMutation } from '@/floor/chatObserver';
import { backendStatus } from '@/generate';
import { getContext, isAiStoryMessage } from '@/st/context';
import { hasImageTagTrace, parseImageTags } from '@/st/imageTagRegex';
import { isCurrentChatExcluded, settings } from '@/state/settings';

import { BBI_IMAGE_EXTRA_KEY, type BbiImageStore } from '@/floor/storage';

import { normalizeRewriteHint } from './hint';
import { imageAnchors } from './move';
import { bindMultiRewriteButtons } from './floorMultiRewrite';
import { drawnPassages } from './sources';
import { floorPassages, passageGroupsHint } from './passage';
import PassageGenDialog from './PassageGenDialog.vue';
import { clearDraft, draftFrom, draftPick, draftStale, readDraft, saveDraft, textMark } from './pickDraft';

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

/**
 * 上次在这一楼挑的段落(只在内存里)。没写成(失败、中断、AI 一张没给)时正文没变,
 * 再打开就把上次的分组和要求带上,不用重选;写成了正文就变了,自然不再带。
 */
interface LastPick {
  regen: boolean;
  groups: string[][];
  extra: string;
  text: string;
}
const lastPicks = new Map<string, LastPick>();
const MAX_PICKS = 20;

function pickKey(floor: number): string {
  return `${getContext()?.getCurrentChatId?.() ?? ''}\u0000${floor}`;
}

/** 正文没变、段落还在,才把上次的选择带回来。 */
export function restorablePick(
  last: LastPick | undefined,
  text: string,
  regen: boolean,
  passageIds: string[],
): { groups: string[][]; extra: string } | undefined {
  if (!last || last.regen !== regen || last.text !== text) return undefined;
  const groups = last.groups.map(group => group.filter(id => passageIds.includes(id))).filter(group => group.length);
  return groups.length ? { groups, extra: last.extra } : undefined;
}

function setRunning(button: HTMLElement, running: boolean): void {
  button.dataset.running = running ? '1' : '';
  button.classList.toggle(ICON_CLASS, !running);
  button.classList.toggle('fa-spinner', running);
  button.classList.toggle('fa-spin', running);
}

/** 段落 id → 紧跟在它后面的原有图(第几张 + 缩略图);楼头没有段落的记在空串下。 */
export type ImageMarks = Record<string, Array<{ n: number; src?: string }>>;

/** 本楼(当前 swipe)第 seq 张最新出好的那次图片路径,没出过返回 undefined。 */
export function slotThumb(floor: number, seq: number): string | undefined {
  const message = getContext()?.chat?.[floor];
  const bucket = (message?.extra?.[BBI_IMAGE_EXTRA_KEY] as BbiImageStore | undefined)?.[String(message?.swipe_id ?? 0)] ?? {};
  return Object.values(bucket)
    .flat()
    .filter(e => (e.slotSeq ?? 0) === seq && e.status === 'ready' && e.path)
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.path;
}

/** 「再加图」时标出本楼原来的图插在哪几段后面,带上每张最新出好的那次做缩略图。 */
function existingImageMarks(floor: number): ImageMarks {
  const message = getContext()?.chat?.[floor];
  if (!message?.mes) return {};
  const marks: ImageMarks = {};
  for (const { passageId, seq } of imageAnchors(message.mes, settings.excludes.customStripTags)) {
    (marks[passageId] ??= []).push({ n: seq + 1, src: slotThumb(floor, seq) });
  }
  return marks;
}

interface DialogHandlers {
  /** 挑好段落:hint 是拼好的「第 N 张图只画正文」要求 */
  onSubmit: (hint: string) => void;
  /** 重新生成不指定段落:最多几张 */
  onAuto?: (count: number) => void;
  /** 没选就关了 */
  onCancel?: () => void;
}

/** 打开挑段落弹窗;选好后跑回调(弹窗先关,写 tag 与出图在后台继续)。regenMax 给了就是「重新生成」。 */
export function openPassageGenDialog(floor: number, handlers: DialogHandlers, existing = 0, regenMax?: number): void {
  const root = document.getElementById(HOST_ID)?.shadowRoot;
  if (!root) return;
  closeCurrent?.();
  const passages = floorPassages(floor);
  const key = pickKey(floor);
  const text = getContext()?.chat?.[floor]?.mes ?? '';
  const regen = regenMax !== undefined;
  const failed = restorablePick(lastPicks.get(key), text, regen, passages.map(p => p.id));
  // 上次没写成的优先;否则看有没有点「保存」存下的半截选择
  let stored = readDraft(key);
  if (draftStale(stored, text)) {
    // 上次点了「生成」而且已经写进正文了:存档作废
    clearDraft(key);
    stored = undefined;
  }
  const saved = failed ? undefined : draftPick(stored, regen, passages);
  const initial = failed ?? saved;
  // 点过「生成」但正文没变 = 没写成(失败,或者页面中途被杀了)
  const unsent = !failed && !!saved && stored?.sent === undefined;
  const marks = existing > 0 ? existingImageMarks(floor) : {};
  const drawn = existing > 0 ? drawnPassages(floor) : {};
  const container = document.createElement('div');
  root.appendChild(container);
  let closing = false;
  let closed = false;
  let settled = false;

  const close = () => {
    if (closeCurrent !== close) return;
    if (!settled) {
      settled = true;
      handlers.onCancel?.();
    }
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
        regenMax,
        marks,
        drawn,
        initial,
        initialKind: unsent ? 'draft' : initial ? 'failed' : undefined,
        configured: backendStatus().configured,
        closing,
        onClose: close,
        onSubmit: (groups: string[][], extra: string) => {
          if (closing) return;
          const chosen = groups.map(ids => passages.filter(p => ids.includes(p.id)));
          // 段落那几行不截断(分组多时会超过要求的字数上限),只截用户另写的要求
          const hint = [passageGroupsHint(chosen), normalizeRewriteHint(extra)].filter(s => s.trim()).join('\n');
          // 存档留到写成为止(下次打开时正文变了才作废):等 AI 的时候页面被杀也不丢
          saveDraft(key, { ...draftFrom(regen, groups, extra, passages), sent: textMark(text) });
          lastPicks.delete(key);
          lastPicks.set(key, { regen, groups, extra, text });
          while (lastPicks.size > MAX_PICKS) lastPicks.delete(lastPicks.keys().next().value as string);
          settled = true;
          close();
          if (hint) handlers.onSubmit(hint);
        },
        // 选了就存;全清空了就删掉存档
        onSave: (groups: string[][], extra: string) => {
          if (closing) return;
          if (groups.some(group => group.length) || extra.trim()) saveDraft(key, draftFrom(regen, groups, extra, passages));
          else clearDraft(key);
        },
        onAuto: (count: number) => {
          if (closing) return;
          settled = true;
          close();
          handlers.onAuto?.(count);
        },
      }),
      container,
    );
  };
  paint();
}

function onActivate(button: HTMLElement): void {
  if (button.dataset.running === '1') return;
  openPassageGenFor(Number(button.closest('.mes')?.getAttribute('mesid')), button);
}

/** 按楼号打开(楼层按钮、批量页「单楼操作」共用);button 给了就在上面转圈。 */
export function openPassageGenFor(floor: number, button?: HTMLElement, onDone?: (outcome: TagRunOutcome) => void): void {
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
    {
      onSubmit: hint => {
        if (button) setRunning(button, true);
        void requestFocusedTags(floor, hint, add)
          .then(outcome => onDone?.(outcome))
          .finally(() => button && setRunning(button, false));
      },
    },
    existing,
  );
}

/**
 * 已有 tag 的楼按「重新生成」(上游 actionButton 的确认窗换成这个):
 * 不指定段落 → { count }(最多几张,覆盖设置的上限);指定段落 → { focus }(几组几张);取消 → null。
 */
export function chooseRegen(floor: number): Promise<{ focus?: string; count?: number } | null> {
  return new Promise(resolve => {
    openPassageGenDialog(
      floor,
      {
        onSubmit: focus => resolve({ focus }),
        onAuto: count => resolve({ count }),
        onCancel: () => resolve(null),
      },
      0,
      settings.autoTag.maxImages,
    );
  });
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
  for (const mesEl of mesToSync()) { // fork:长聊天只看变过的楼
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
  bindMultiRewriteButtons();
  bindFloorMenu();
  bindLongChatRender();
  return true;
}
