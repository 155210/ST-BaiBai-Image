/**
 * fork:单楼操作的「上一楼 / 下一楼」——跳过用户楼这类不能操作的楼,直接到隔壁的剧情楼。
 * 没填楼号时:下一楼从 0 往后找,上一楼从最后一楼往前找。往那边已经没有了就返回 null。
 */
export function stepFloor(count: number, from: number, dir: 1 | -1, usable: (floor: number) => boolean): number | null {
  let floor = Number.isInteger(from) ? from + dir : dir > 0 ? 0 : count - 1;
  // 楼号填超了:往回走就从边上开始找
  if (dir < 0 && floor >= count) floor = count - 1;
  if (dir > 0 && floor < 0) floor = 0;
  for (; floor >= 0 && floor < count; floor += dir) {
    if (usable(floor)) return floor;
  }
  return null;
}
