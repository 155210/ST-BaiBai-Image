import { ensureChatObserver, onChatMutation } from '@/floor/chatObserver';
import { isCurrentChatExcluded } from '@/state/settings';
import { getContext, isAiStoryMessage } from '@/st/context';

/**
 * 楼层「⋯」里的柏宝绘按钮收成一个 🎧(本 fork 新增)。
 *
 * 手机上「⋯」展开后三颗按钮(写 tag / 挑段落生图 / 一起改)挤在一排容易按错。
 * 原来的三颗照常注入(各自的进行中状态、标题都不动),只用样式藏起来;
 * 🎧 点开一个竖排菜单,点哪项就替用户点对应那颗。
 */

const MENU_BUTTON_CLASS = 'bbi-floor-menu';
const POPUP_CLASS = 'bbi-floor-menu-pop';
const STYLE_ID = 'bbi-floor-menu-style';

/** 收进菜单的按钮,按菜单里的顺序。 */
export const MENU_ITEMS = ['bbi-tag-action', 'bbi-passage-gen-action', 'bbi-multi-rewrite-action'] as const;

const CSS = `
.extraMesButtons .bbi-tag-action,
.extraMesButtons .bbi-passage-gen-action,
.extraMesButtons .bbi-multi-rewrite-action { display: none !important; }
.${POPUP_CLASS} {
  position: fixed; z-index: 10040; min-width: 220px; max-width: calc(100vw - 16px);
  display: flex; flex-direction: column; gap: 4px; padding: 6px;
  border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,.2)); border-radius: 10px;
  background: var(--SmartThemeBlurTintColor, rgba(30,30,30,.96)); color: var(--SmartThemeBodyColor, #eee);
  box-shadow: 0 6px 24px rgba(0,0,0,.4); backdrop-filter: blur(8px);
}
.${POPUP_CLASS} button {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 44px;
  padding: 8px 12px; border: 0; border-radius: 8px; background: none; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
}
.${POPUP_CLASS} button:hover, .${POPUP_CLASS} button:focus-visible { background: rgba(127,127,127,.18); outline: none; }
.${POPUP_CLASS} button + button { border-top: 1px solid rgba(127,127,127,.18); }
.${POPUP_CLASS} small { font-size: 12px; opacity: .65; }
`;

export interface MenuEntry {
  label: string;
  hint: string;
  running: boolean;
}

/** 按钮的标题拆成菜单项:括号前是名字,括号里是小字说明;tag 按钮按本楼有没有 tag 换名字。 */
export function menuEntry(kind: (typeof MENU_ITEMS)[number], title: string, running: boolean, hasTags: boolean): MenuEntry {
  if (kind === 'bbi-tag-action') {
    return { label: hasTags ? '重新生成 tag' : '生成生图 tag', hint: hasTags ? '可以指定段落或定最多几张' : 'AI 读这一楼写 tag', running };
  }
  const match = /^(.*?)（(.*)）$/.exec(title.trim());
  return { label: match ? match[1] : title.trim(), hint: match ? match[2] : '', running };
}

let closePopup: (() => void) | null = null;

function openPopup(anchor: HTMLElement): void {
  closePopup?.();
  const mesEl = anchor.closest('.mes');
  const extra = anchor.closest('.extraMesButtons');
  if (!mesEl || !extra) return;
  const floor = Number(mesEl.getAttribute('mesid'));
  const hasTags = /<bbi_image>/i.test(getContext()?.chat?.[floor]?.mes ?? '');

  const pop = document.createElement('div');
  pop.className = POPUP_CLASS;
  pop.setAttribute('role', 'menu');
  for (const kind of MENU_ITEMS) {
    const target = extra.querySelector<HTMLElement>(`.${kind}`);
    if (!target) continue;
    const entry = menuEntry(kind, target.title, target.dataset.running === '1', hasTags);
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    const label = document.createElement('span');
    label.textContent = entry.running ? `${entry.label}（进行中）` : entry.label;
    item.appendChild(label);
    if (entry.hint) {
      const hint = document.createElement('small');
      hint.textContent = entry.hint;
      item.appendChild(hint);
    }
    item.addEventListener('click', event => {
      event.stopPropagation();
      close();
      target.click();
    });
    pop.appendChild(item);
  }
  if (!pop.childElementCount) return;
  document.body.appendChild(pop);

  // 摆在按钮下方,放不下就放上方;左右不出屏
  const rect = anchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  const below = rect.bottom + 6;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  const onOutside = (event: Event) => {
    if (!pop.contains(event.target as Node) && event.target !== anchor) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  function close(): void {
    if (closePopup !== close) return;
    closePopup = null;
    pop.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    document.getElementById('chat')?.removeEventListener('scroll', close);
  }
  closePopup = close;
  // 下一帧再挂:别让打开它的这次点击立刻又把它关掉
  requestAnimationFrame(() => {
    if (closePopup !== close) return;
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    document.getElementById('chat')?.addEventListener('scroll', close, { passive: true });
  });
}

function createButton(): HTMLDivElement {
  const button = document.createElement('div');
  button.className = `mes_button fa-solid fa-headphones ${MENU_BUTTON_CLASS}`;
  button.title = '柏宝绘';
  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', '0');
  button.setAttribute('aria-haspopup', 'menu');
  const activate = (event: Event) => {
    event.stopPropagation();
    if (closePopup) {
      closePopup();
      return;
    }
    openPopup(button);
  };
  button.addEventListener('click', activate);
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(event);
    }
  });
  return button;
}

/** 与其它楼层按钮同一套对账:剧情楼有、别的楼撤。 */
function syncButtons(): void {
  const chat = getContext()?.chat;
  if (!chat) return;
  const excluded = isCurrentChatExcluded();
  for (const mesEl of document.querySelectorAll<HTMLElement>('#chat .mes')) {
    const extra = mesEl.querySelector('.extraMesButtons');
    if (!extra) continue;
    const floor = Number(mesEl.getAttribute('mesid'));
    const wanted = !excluded && Number.isInteger(floor) && isAiStoryMessage(chat[floor]);
    const existing = extra.querySelector<HTMLElement>(`.${MENU_BUTTON_CLASS}`);
    if (wanted && !existing) extra.appendChild(createButton());
    else if (!wanted && existing) existing.remove();
  }
}

let bound = false;

export function bindFloorMenu(): void {
  if (bound || !ensureChatObserver()) return;
  bound = true;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  onChatMutation(syncButtons);
  syncButtons();
}
