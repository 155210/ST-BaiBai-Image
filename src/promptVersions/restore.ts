import { h, render } from 'vue';

import { hydrateMessage } from '@/floor/hydrate';
import { readStore } from '@/floor/storage';
import { getContext, type STMessage } from '@/st/context';
import { formatPromptText, parseImageTagContent, parseImageTags, replaceImageTagAt } from '@/st/imageTagRegex';
import { applyMessageText, type MessageExtraUpdate } from '@/st/messageEdit';

import { PROMPT_MEMO_KEY, rememberedMemo, slotVersions, tagDiff } from './versions';
import VersionsDialog from './VersionsDialog.vue';

// 与 index.ts 的 HOST_ID 一致
const HOST_ID = 'bbi-app-host';
const LEAVE_MS = 160;
const LATE_HYDRATION_MS = 100;

export interface SlotAt {
  chatId: string;
  messageId: number;
  swipeId: number;
  seq: number;
}

/**
 * 改提示词写回正文时顺手记下改掉的那条(只记没出过图的;出过图的在图片记录里本来就有)。
 * 交给 applyMessageText 的 extraUpdate,和正文一起落盘、保存失败一起回滚。
 */
export function rememberPrompt(
  message: STMessage,
  swipeId: number,
  seq: number,
  oldTag: string,
): MessageExtraUpdate | undefined {
  const memo = rememberedMemo(message.extra, readStore(message), swipeId, seq, oldTag);
  return memo ? { key: PROMPT_MEMO_KEY, value: memo } : undefined;
}

/** 这个槽位有没有别的提示词版本可以换回去。 */
export function hasSlotVersions(at: SlotAt, tag: string): boolean {
  const message = getContext()?.chat?.[at.messageId];
  return !!message && slotVersions(readStore(message), message.extra, at.swipeId, at.seq, tag).length > 0;
}

function promptText(tag: string): string {
  return formatPromptText(parseImageTagContent(tag));
}

/** 把第 seq 张图的提示词换成 prompt;正文里这条 tag 已经不是 rawTag 了就不写。 */
async function restore(at: SlotAt, rawTag: string, prompt: string): Promise<boolean> {
  const context = getContext();
  const message = context?.chat?.[at.messageId];
  if (!context || !message) {
    toastr.error('楼层已不存在', '柏宝绘');
    return false;
  }
  let result;
  try {
    result = await applyMessageText(
      at.messageId,
      text => (parseImageTags(text)[at.seq] !== rawTag ? null : replaceImageTagAt(text, at.seq, prompt)),
      at.chatId,
      at.swipeId,
      message,
      rememberPrompt(message, at.swipeId, at.seq, rawTag),
    );
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error), '柏宝绘');
    return false;
  }
  if (result !== 'saved') {
    toastr.warning(
      result === 'build-failed' ? '这张图的提示词刚被改动过，请关掉重新打开' : '聊天或楼层已变化，没有换回',
      '柏宝绘',
    );
    return false;
  }
  // 同 promptEditor.ts 的 writeBack:ST 编辑框开着时不会自己重水合,这里补两次
  hydrateMessage(at.messageId, context);
  setTimeout(() => {
    const later = getContext();
    if (later?.getCurrentChatId() === at.chatId) hydrateMessage(at.messageId, later);
  }, LATE_HYDRATION_MS);
  return true;
}

let closeCurrent: (() => void) | null = null;

/** 打开「提示词历史」:列出这张图用过的提示词,点「换回这版」写回正文。 */
export function openSlotVersions(at: SlotAt, onRestored?: () => void): void {
  const root = document.getElementById(HOST_ID)?.shadowRoot;
  const message = getContext()?.chat?.[at.messageId];
  const rawTag = message ? parseImageTags(message.mes ?? '')[at.seq] : undefined;
  if (!root || !message || !rawTag) return;
  closeCurrent?.();
  const versions = slotVersions(readStore(message), message.extra, at.swipeId, at.seq, rawTag).map(version => ({
    ...version,
    text: promptText(version.prompt),
    diff: tagDiff(rawTag, version.prompt),
  }));

  const container = document.createElement('div');
  root.appendChild(container);
  let closing = false;
  let busy = false;
  const close = () => {
    if (closeCurrent !== close) return;
    closeCurrent = null;
    closing = true;
    paint();
    setTimeout(() => {
      render(null, container);
      container.remove();
    }, LEAVE_MS);
  };
  closeCurrent = close;

  const paint = () =>
    render(
      h(VersionsDialog, {
        floor: at.messageId,
        seq: at.seq,
        current: promptText(rawTag),
        versions,
        closing,
        onClose: close,
        onRestore: (hash: string) => {
          const version = versions.find(v => v.hash === hash);
          if (!version || busy) return;
          busy = true;
          void restore(at, rawTag, version.prompt).then(ok => {
            busy = false;
            if (!ok) return;
            toastr.success(version.count ? '已换回这版提示词，卡片显示这版的图' : '已换回这版提示词', '柏宝绘');
            close();
            onRestored?.();
          });
        },
      }),
      container,
    );
  paint();
}
