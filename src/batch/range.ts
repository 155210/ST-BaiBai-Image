/**
 * 楼层范围解析:「0-100, 150, 200-」→ 升序去重的楼号表。
 *
 * 楼号即 ST 的零基 mesid。空串 = 整个聊天;`a-` = 从 a 到最后一楼。
 * 超出聊天长度的部分静默截掉(「0-9999」是常见写法),但整段都越界算写错。
 */
export function parseFloorRange(text: string, lastFloor: number): number[] {
  if (lastFloor < 0) return [];
  const parts = text.split(/[,，、\s]+/).filter(Boolean);
  if (!parts.length) return Array.from({ length: lastFloor + 1 }, (_, index) => index);
  const floors = new Set<number>();
  for (const part of parts) {
    const match = /^(\d+)(?:[-~～](\d*))?$/.exec(part);
    if (!match) throw new Error(`看不懂的范围：${part}`);
    let start = Number(match[1]);
    let end = match[2] === undefined ? start : match[2] === '' ? lastFloor : Number(match[2]);
    if (start > end) [start, end] = [end, start];
    if (start > lastFloor) throw new Error(`第 ${start} 楼不存在（最后一楼是 ${lastFloor}）`);
    for (let floor = start; floor <= Math.min(end, lastFloor); floor++) floors.add(floor);
  }
  return [...floors].sort((left, right) => left - right);
}

/**
 * 「每 N 个 AI 楼出一次图」:从范围内第一个 AI 楼起,取第 1、N+1、2N+1… 个。
 * 先抽样、再看有没有 tag,所以同一范围重跑抽中的楼不变(不会因为前一次写了 tag 而错位)。
 */
export function pickEveryNth(aiFloors: number[], step: number): number[] {
  const n = Math.max(1, Math.floor(step) || 1);
  return n === 1 ? aiFloors : aiFloors.filter((_, index) => index % n === 0);
}
