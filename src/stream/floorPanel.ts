import { onChatMutation } from '@/floor/chatObserver';
import { getContext } from '@/st/context';
import { activeStreams, onStreamsChange, REFRESH_MS, tailText, type Live } from './live';
import { readOpenPref, writeOpenPref } from './openPref';

/**
 * (本 fork 新增)楼层上的「实时输出」折叠区:副 API 开了流式时,正在写生图 tag 的那一楼
 * 正文下面出现一条「柏宝绘正在写生图 tag」,点开能看 AI 正在写什么。写完(或失败)就撤掉。
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
  toggle: HTMLElement;
  pre: HTMLElement;
  text: Text;
  open: boolean;
  timer: ReturnType<typeof setInterval> | null;
  /** 上次画到界面上的累计字数,没变就不重写文本。 */
  shownTotal: number;
}

const panels = new Map<number, Panel>();
let bound = false;

/** 展开时标题右侧的状态行。纯函数,便于测试。 */
export function panelMeta(live: Pick<Live, 'total' | 'lastAt'>, now: number): string {
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
.${PANEL_CLASS} pre{margin:0;padding:6px 10px 8px;max-height:220px;overflow-y:auto;-webkit-overflow-scrolling:touch;white-space:pre-wrap;word-break:break-all;font-family:var(--monoFontFamily,monospace);font-size:11px;opacity:.85;border-top:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.25))}
`;
  document.head.appendChild(style);
}

function render(panel: Panel): void {
  const { live } = panel;
  panel.meta.textContent = panelMeta(live, Date.now());
  if (live.total === panel.shownTotal) return;
  panel.shownTotal = live.total;
  const pre = panel.pre;
  // 用户没往上翻时跟着最新内容走
  const atBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
  panel.text.data = tailText(live, MAX_SHOWN);
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

function setOpen(panel: Panel, open: boolean): void {
  panel.open = open;
  panel.el.querySelector('button')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  panel.toggle.textContent = open ? '收起' : '展开';
  panel.pre.hidden = !open;
  panel.meta.hidden = !open;
  if (open) {
    panel.shownTotal = -1;
    render(panel);
    if (!panel.timer) panel.timer = setInterval(() => render(panel), REFRESH_MS);
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
  title.textContent = '柏宝绘正在写生图 tag';
  const meta = document.createElement('span');
  meta.className = 'bbi-live-meta';
  const toggle = document.createElement('span');
  toggle.className = 'bbi-live-toggle';
  head.append(icon, title, meta, toggle);

  const pre = document.createElement('pre');
  const text = document.createTextNode('');
  pre.appendChild(text);
  el.append(head, pre);

  const panel: Panel = { floor, live, el, meta, toggle, pre, text, open: false, timer: null, shownTotal: -1 };
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
  for (const live of activeStreams()) {
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
      if (panel.open) render(panel);
    }
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
    // 没有在途请求也没挂着的折叠区:什么都不用做(这是绝大多数时候)
    if (!panels.size && !activeStreams().length) return;
    reconcile();
  });
}
