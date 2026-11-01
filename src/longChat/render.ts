import { onChatMutation } from '@/floor/chatObserver';

/**
 * fork:楼层渲染得很多时(跳到很早的楼、一路「加载更多」到上千楼),让浏览器跳过
 * 屏幕外楼层的排版和绘制。
 *
 * 实测 1900 楼渲染出来时,点楼层菜单、写 tag 期间每次页面变动都要重排整条聊天,
 * 一下卡 0.3–1.7 秒(手机更久);给楼层加 content-visibility:auto 后几乎不卡。
 * 只在楼层多时才加,平时的聊天完全不受影响。contain-intrinsic-size 用 auto:
 * 楼层真正显示过一次后,浏览器就记住它的实际高度,滚动条不会乱跳。
 */

const CLASS = 'bbi-long-chat';
const STYLE_ID = 'bbi-long-chat-style';
/** 渲染出来的楼超过这么多才启用。 */
export const LONG_CHAT_FLOORS = 300;

const CSS = `#chat.${CLASS} > .mes { content-visibility: auto; contain-intrinsic-size: auto 320px; }`;

export function isLongChat(rendered: number): boolean {
  return rendered > LONG_CHAT_FLOORS;
}

function sync(): void {
  const chat = document.getElementById('chat');
  if (!chat) return;
  const on = isLongChat(chat.childElementCount);
  if (chat.classList.contains(CLASS) !== on) chat.classList.toggle(CLASS, on);
}

let bound = false;

export function bindLongChatRender(): void {
  if (bound) return;
  bound = true;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  onChatMutation(sync);
  sync();
}
