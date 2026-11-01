/**
 * fork:长聊天(上千楼都渲染出来时)楼层按钮对账只看变过的楼。
 *
 * 原来每次 #chat 有变动,四个楼层按钮对账(写 tag / 挑段落 / 一起改 / 🎧 菜单)都把
 * 全部 .mes 扫一遍。一千九百楼时一次约 90ms(手机上翻几倍),流式输出或点开对话框
 * 时每帧都来一次,就是「点开就卡死」。
 *
 * 这里从 MutationRecord 里收集「哪几楼变了」,对账时只给这些楼。下面这些情况仍走全量,
 * 保证不漏:第一次、调用发生在 flush 之外(绑定时那次)、有楼被删(ST 会给后面的楼重编号)、
 * 聊天换了或楼数变了、排除名单状态变了、一次变动的楼太多。
 */

const MES = '.mes';
/** 一次变的楼超过这么多就直接全量,省得逐个比较。 */
const FULL_SCAN_OVER = 200;

const dirty = new Set<HTMLElement>();
let needFull = true;
let current: HTMLElement[] | null | undefined;
let lastKey = '';

function addMesIn(node: Node): void {
  if (!(node instanceof Element)) return;
  if (node.matches(MES)) dirty.add(node as HTMLElement);
  else for (const el of node.querySelectorAll<HTMLElement>(MES)) dirty.add(el);
}

/** 观察器回调里调:记下这批变动涉及的楼。 */
export function noteMutations(records: MutationRecord[]): void {
  if (needFull) return;
  for (const record of records) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    const mes = target?.closest<HTMLElement>(MES);
    if (mes) {
      dirty.add(mes);
      continue;
    }
    for (const node of record.removedNodes) {
      if (node instanceof Element && (node.matches(MES) || node.querySelector(MES))) {
        needFull = true;
        return;
      }
    }
    for (const node of record.addedNodes) addMesIn(node);
  }
  if (dirty.size > FULL_SCAN_OVER) needFull = true;
}

/**
 * flush 前调:定下本轮对账要看哪些楼。stateKey 是聊天 id / 楼数 / 排除状态这类
 * 「变了就得全量」的指纹。
 */
export function beginFlush(stateKey: string): void {
  if (stateKey !== lastKey) needFull = true;
  lastKey = stateKey;
  current = needFull ? null : [...dirty].filter(el => el.isConnected);
  dirty.clear();
  needFull = false;
}

export function endFlush(): void {
  current = undefined;
}

/** 对账要看的 .mes:flush 里是变过的那几楼,其余时候(含全量)是 #chat 下全部。 */
export function mesToSync(): Iterable<HTMLElement> {
  return current ?? document.querySelectorAll<HTMLElement>(`#chat ${MES}`);
}
