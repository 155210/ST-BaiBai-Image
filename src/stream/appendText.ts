import type { Live } from './live';

/**
 * 实时输出显示全文,但只把新来的那一截追加到同一个 Text 节点上(本 fork 新增)。
 *
 * 每次刷新都整段重写几万字,手机上会越写越卡;追加只排版新的那几行,而且往上翻着看时
 * 前面的字不动,看的地方不会跑。只有换了一条请求、或全文超过 live.ts 的上限被从前面截掉时,
 * 才整段重画一次。
 */

export interface Drawn {
  id: number;
  /** 已画上去的 live.text 长度。 */
  len: number;
  /** 画的时候前面被截掉了多少字。 */
  skip: number;
}

export const NOTHING_DRAWN: Drawn = { id: -1, len: 0, skip: 0 };

type TextLike = Pick<Text, 'data' | 'appendData'>;

/** 有没有新东西要画。 */
export function hasNew(live: Pick<Live, 'id' | 'text' | 'total'>, drawn: Drawn): boolean {
  return drawn.id !== live.id || drawn.len !== live.text.length || drawn.skip !== live.total - live.text.length;
}

/** 把 live 的全文画进 node:能追加就追加,不能就整段重画。返回新的已画状态。 */
export function drawFull(node: TextLike, live: Pick<Live, 'id' | 'text' | 'total'>, drawn: Drawn): Drawn {
  const skip = live.total - live.text.length;
  if (drawn.id === live.id && drawn.skip === skip && drawn.len <= live.text.length) {
    if (live.text.length > drawn.len) node.appendData(live.text.slice(drawn.len));
  } else {
    node.data = skip > 0 ? `…（前面还有 ${skip} 字）\n${live.text}` : live.text;
  }
  return { id: live.id, len: live.text.length, skip };
}
