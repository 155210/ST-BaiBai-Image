import type { PositionedCharOp } from '@/autoTag/charAnchors';
import { getContext } from '@/st/context';
import {
  BBI_CHAR_EXTRA_KEY,
  makeCharTagFloorDelta,
  readCharTagFloorDelta,
  recomputeCharTags,
  type CharTagAutoOp,
} from '@/state/charTags';

/**
 * fork:单张重写 / 挑段落加图时,AI 给库里没有的人建档也要收下。
 *
 * 上游在这两条路上把 AI 的 changes 全扔了(怕首次分析建过的档再建一遍)。可用户常常
 * 就是让它「把缺的人补进角色库」,AI 照做了,结果一个都没进库。这里只放行一种:
 * 「新建」且名字在本楼为止的库里确实没有;改已有角色的字段照旧不收。
 */

const key = (name: string) => name.trim().toLowerCase();

/** 只留库里没有的新角色建档(同一次里重复建同一个人只算一次)。 */
export function newCharsOnly(ops: PositionedCharOp[], known: { name: string }[]): PositionedCharOp[] {
  const seen = new Set(known.map(entry => key(entry.name)));
  return ops.filter(item => {
    if (item.op.kind !== 'new') return false;
    const k = key(item.op.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 合进这一楼已有的角色增量:同一 swipe 就接在后面,换过 swipe 的旧增量不算数。 */
export function mergeFloorOps(existing: { swipe: number; ops: CharTagAutoOp[] } | null, swipe: number, ops: CharTagAutoOp[]): CharTagAutoOp[] {
  const kept = existing && existing.swipe === swipe ? existing.ops : [];
  return [...kept, ...ops];
}

/** 正文写回成功后,把新角色记进这一楼并落盘,再刷新角色库。 */
export async function saveNewChars(floor: number, swipe: number, ops: CharTagAutoOp[]): Promise<void> {
  if (!ops.length) return;
  const ctx = getContext();
  const message = ctx?.chat?.[floor];
  if (!ctx || !message) return;
  const delta = makeCharTagFloorDelta(mergeFloorOps(readCharTagFloorDelta(message), swipe, ops), swipe);
  message.extra = { ...(message.extra ?? {}), [BBI_CHAR_EXTRA_KEY]: delta };
  recomputeCharTags();
  await ctx.saveChat();
  toastr.info(`已把 ${ops.map(op => op.name).join('、')} 加进本聊天的角色库`, '柏宝绘');
}
