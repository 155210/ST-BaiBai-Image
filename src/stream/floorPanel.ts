import { onChatMutation } from '@/floor/chatObserver';
import { getContext } from '@/st/context';
import { cancelFloorTags } from '@/autoTag/runner';
import { copyText } from '@/st/clipboard';

import { floorStreams, onStreamsChange, REFRESH_MS, tailText, type Live } from './live';
import { readOpenPref, writeOpenPref } from './openPref';

/**
 * (本 fork 新增)楼层上的「实时输出」折叠区:副 API 开了流式时,正在写生图 tag 的那一楼
 * 正文下面出现一条「柏宝绘正在写生图 tag」,点开能看 AI 正在写什么。写完(或失败)不撤,
 * 留着给人回看、复制,同一楼下次开始写才换成新的(只在内存里,刷新页面就没了)。
 * 往上翻看时文字定住不动,滑回底部再接着跟。
 *
 * 手机性能:
 * - 收起时只有一行静态标题,不跑定时器、不碰 DOM;新内容只拼进 live.ts 的字符串;
 * - 展开后每 0.5 秒刷新一次,只显示结尾 MAX_SHOWN 个字;
 * - 文字写进同一个 Text 节点的 data(characterData 变更),#chat 的 childList 观察器
 *   (floor/chatObserver.ts)看不见它,不会每次刷新都唤醒楼层按钮对账、卡片自愈。
 *
 * 不碰聊天数据:折叠区挂在 .mes_text **外面**(作为它的下一个兄弟),ST 重写正文、
 * 保存聊天都与它无关;只读 live.ts 里的文本,不读不写 chat[]。
 * 整楼被 ST 重渲染时,#chat 观察器会触发对账,重新挂回去。
 */

const PANEL_CLASS = 'bbi-live-floor';
const STYLE_ID = 'bbi-live-floor-style';
/** 楼层上只显示结尾这么多字:楼层里的框小,手机上也不必每次塞两万字进去。 */
const MAX_SHOWN = 4000;

interface Panel {
  floor: number;
  live: Live;
  el: HTMLElement;
  meta: HTMLElement;
  title: HTMLElement;
  toggle: HTMLElement;
  tools: HTMLElement;
  resume: HTMLElement;
  stop: HTMLElement;
  pre: HTMLElement;
  text: Text;
  open: boolean;
  timer: ReturnType<typeof setInterval> | null;
  /** 上次画到界面上的累计字数,没变就不重写文本。 */
  shownTotal: number;
  /** 在底部跟着最新内容走;往上翻了就定住。 */
  follow: boolean;
}

const panels = new Map<number, Panel>();
let bound = false;

/** 展开时标题右侧的状态行。纯函数,便于测试。 */
export function panelMeta(live: Pick<Live, 'total' | 'lastAt'> & { done?: boolean; error?: string }, now: number): string {
  if (live.done) return live.error ? `${live.error} · 共 ${live.total} 字` : `已结束 · 共 ${live.total} 字`;
  const quiet = Math.max(0, Math.floor((now - live.lastAt) / 1000));
  if (!live.total) return `等待第一段内容… ${quiet} 秒`;
  return `已收到 ${live.total} 字${quiet >= 3 ? ` · ${quiet} 秒没有新内容` : ''}`;
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.${PANEL_CLASS}{margin:6px 0 2px;border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.4));border-radius:8px;font-size:12px;line-height:1.5;overflow:hidden}
.${PANEL_CLASS}>button{display:flex;align-items:center;gap:6px;width:100%;padding:6px 10px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.${PANEL_CLASS} .bbi-live-title{flex:1 1 auto;min-width:0;opacity:.85}
.${PANEL_CLASS} .bbi-live-meta{flex:0 1 auto;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.${PANEL_CLASS} .bbi-live-toggle{flex:0 0 auto;opacity:.6}
.${PANEL_CLASS} .bbi-live-tools{display:flex;gap:8px;justify-content:flex-end;padding:0 10px 8px}
.${PANEL_CLASS} .bbi-live-tools button{padding:2px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.4));border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.${PANEL_CLASS} pre{margin:0;padding:6px 10px 8px;max-height:220px;overflow-y:auto;-webkit-overflow-scrolling:touch;white-space:pre-wrap;word-break:break-all;font-family:var(--monoFontFamily,monospace);font-size:11px;opacity:.85;border-top:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.25))}
`;
  document.head.appendChild(style);
}

function titleOf(live: Live): string {
  return live.done ? '柏宝绘上次写的生图 tag' : '柏宝绘正在写生图 tag';
}

function render(panel: Panel): void {
  const { live } = panel;
  panel.meta.textContent = panelMeta(live, Date.now());
  const title = titleOf(live);
  if (panel.title.textContent !== title) panel.title.textContent = title;
  panel.resume.hidden = panel.follow;
  panel.stop.hidden = live.done;
  // 写完且已画到最后:停掉刷新定时器
  if (live.done && live.total === panel.shownTotal && panel.timer) {
    clearInterval(panel.timer);
    panel.timer = null;
  }
  // 收起时不碰文字;往上翻着看时也不动,不然开头被截掉、看的地方会一直往上跑
  if (!panel.open || live.total === panel.shownTotal || !panel.follow) return;
  panel.shownTotal = live.total;
  panel.text.data = tailText(live, MAX_SHOWN);
  panel.pre.scrollTop = panel.pre.scrollHeight;
}

function onPanelScroll(panel: Panel): void {
  const pre = panel.pre;
  const atBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
  if (atBottom === panel.follow) return;
  panel.follow = atBottom;
  panel.resume.hidden = atBottom;
  if (atBottom) render(panel);
}

function setOpen(panel: Panel, open: boolean): void {
  panel.open = open;
  panel.el.querySelector('button')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  panel.toggle.textContent = open ? '收起' : '展开';
  panel.pre.hidden = !open;
  panel.tools.hidden = !open;
  panel.meta.hidden = !open;
  if (open) {
    panel.shownTotal = -1;
    panel.follow = true;
    render(panel);
    if (!panel.timer && !panel.live.done) panel.timer = setInterval(() => render(panel), REFRESH_MS);
  } else if (panel.timer) {
    clearInterval(panel.timer);
    panel.timer = null;
  }
}

function createPanel(floor: number, live: Live): Panel {
  ensureStyle();
  const el = document.createElement('div');
  el.className = PANEL_CLASS;
  el.dataset.floor = String(floor);

  const head = document.createElement('button');
  head.type = 'button';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-feather-pointed';
  const title = document.createElement('span');
  title.className = 'bbi-live-title';
  title.textContent = titleOf(live);
  const meta = document.createElement('span');
  meta.className = 'bbi-live-meta';
  const toggle = document.createElement('span');
  toggle.className = 'bbi-live-toggle';
  head.append(icon, title, meta, toggle);

  const pre = document.createElement('pre');
  const text = document.createTextNode('');
  pre.appendChild(text);
  const tools = document.createElement('div');
  tools.className = 'bbi-live-tools';
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.textContent = '停在这里了，回到最新';
  resume.hidden = true;
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = '中断';
  stop.title = '中断这次写 tag，已收到的内容留着';
  stop.hidden = live.done;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制全部';
  tools.append(resume, stop, copy);
  el.append(head, pre, tools);

  const panel: Panel = { floor, live, el, meta, title, toggle, tools, resume, stop, pre, text, open: false, timer: null, shownTotal: -1, follow: true };
  pre.addEventListener('scroll', () => onPanelScroll(panel), { passive: true });
  resume.addEventListener('click', event => {
    event.stopPropagation();
    panel.follow = true;
    panel.shownTotal = -1;
    render(panel);
  });
  stop.addEventListener('click', event => {
    event.stopPropagation();
    if (panel.live.chatId === (getContext()?.getCurrentChatId?.() ?? '')) cancelFloorTags(panel.floor);
  });
  copy.addEventListener('click', event => {
    event.stopPropagation();
    void copyText(panel.live.text, '实时输出已复制');
  });
  head.addEventListener('click', event => {
    // 别让点击冒泡到 ST 的楼层点击逻辑(选择/删除模式等)
    event.stopPropagation();
    const next = !panel.open;
    writeOpenPref(next);
    setOpen(panel, next);
  });
  setOpen(panel, readOpenPref());
  return panel;
}

function dispose(panel: Panel): void {
  if (panel.timer) clearInterval(panel.timer);
  panel.timer = null;
  panel.el.remove();
  panels.delete(panel.floor);
}

/** 对账:该挂的挂、该撤的撤、挂错位置(整楼被重渲染)的重挂。只在真有差异时动 DOM。 */
function reconcile(): void {
  const chatId = getContext()?.getCurrentChatId?.() ?? '';
  // 同一楼有多条(重试/重写叠在一起)时显示最新开始的那条
  const wanted = new Map<number, Live>();
  for (const live of floorStreams()) {
    if (live.floor === undefined || !chatId || live.chatId !== chatId) continue;
    wanted.set(live.floor, live);
  }

  for (const panel of [...panels.values()]) {
    const live = wanted.get(panel.floor);
    const mesText = document.querySelector(`#chat .mes[mesid="${panel.floor}"] .mes_text`);
    if (!live || !mesText || panel.el.parentElement !== mesText.parentElement) {
      dispose(panel);
      continue;
    }
    if (panel.live !== live) {
      panel.live = live;
      panel.shownTotal = -1;
      panel.follow = true;
      if (panel.open && !panel.timer) panel.timer = setInterval(() => render(panel), REFRESH_MS);
    }
    // 开始 / 结束都走到这里:更新标题、状态,写完的最后一段也画上
    render(panel);
  }

  for (const [floor, live] of wanted) {
    if (panels.has(floor)) continue;
    // 楼层不在页面上(批量写的楼大多如此):不挂,批量页有自己的实时输出
    const mesText = document.querySelector(`#chat .mes[mesid="${floor}"] .mes_text`);
    if (!mesText) continue;
    const panel = createPanel(floor, live);
    mesText.after(panel.el);
    panels.set(floor, panel);
  }
}

/** 绑定楼层实时折叠区(幂等)。 */
export function bindFloorStreamPanels(): void {
  if (bound) return;
  bound = true;
  onStreamsChange(reconcile);
  onChatMutation(() => {
    // 没写过 tag 也没挂着的折叠区:什么都不用做(这是绝大多数时候)
    if (!panels.size && !floorStreams().length) return;
    reconcile();
  });
}
