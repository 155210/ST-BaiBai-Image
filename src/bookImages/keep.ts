import { parseImageTags } from '@/st/imageTagRegex';
import { BBI_IMAGE_EXTRA_KEY, promptHash, type BbiImageStore } from '@/floor/storage';

/**
 * 别的插件（小说导入改写）放进楼层的书内插图：正文写 `<bbi_image>插图N</bbi_image>`，
 * 图片路径记在 extra.bbiImage 里。它们不是柏宝绘生成的，「重新生成 tag」时不能跟着删掉。
 */
const BOOK_TAG = /^<bbi_image>\s*插图\d+\s*<\/bbi_image>$/i;
const TAG_TRACE = /<\/?bbi_image\b/i;

export function isBookImageTag(tag: string): boolean {
  return BOOK_TAG.test(String(tag ?? '').trim());
}

const norm = (line: string) => line.replace(/\s+/g, '');

/**
 * 重新生成 tag 后，把旧正文里的书内插图按原位置放回新正文：
 * 插图前面那一行还在 → 放回它后面；找不到 → 按在楼层里的大概位置放。
 * 先后顺序不变；新正文里已经有的不重复放。
 */
export function keepBookTags(before: string, after: string): string {
  const oldLines = String(before ?? '').split(/\r?\n/);
  const books: Array<{ tag: string; anchor: string; ratio: number }> = [];
  let lastText = '';
  let textCount = 0;
  const totalText = oldLines.filter(l => l.trim() && !TAG_TRACE.test(l)).length || 1;
  for (const line of oldLines) {
    const t = line.trim();
    if (isBookImageTag(t)) {
      books.push({ tag: t, anchor: lastText, ratio: textCount / totalText });
      continue;
    }
    if (t && !TAG_TRACE.test(t)) {
      lastText = norm(t);
      textCount += 1;
    }
  }
  if (!books.length) return after;
  const have = new Set(parseImageTags(after).map(t => t.trim()));
  const todo = books.filter(b => !have.has(b.tag));
  if (!todo.length) return after;

  const eol = /\r\n/.test(after) ? '\r\n' : '\n';
  const lines = String(after ?? '').split(/\r?\n/);
  const textIdx = lines.map((l, i) => (l.trim() && !TAG_TRACE.test(l) ? i : -1)).filter(i => i >= 0);
  const inserts = new Map<number, string[]>(); // 插在这一行后面；-1 = 最前面
  let last = -1;
  for (const b of todo) {
    let at = -2;
    if (!b.anchor) at = -1;
    else {
      for (let j = Math.max(0, last); j < lines.length && at === -2; j++) if (norm(lines[j]) === b.anchor) at = j;
      for (let j = 0; j < lines.length && at === -2; j++) if (norm(lines[j]) === b.anchor) at = j;
    }
    if (at === -2) {
      if (!textIdx.length) at = lines.length - 1;
      else {
        const k = Math.min(textIdx.length - 1, Math.max(0, Math.round(b.ratio * textIdx.length) - 1));
        at = Math.max(textIdx[k], last);
      }
    }
    last = Math.max(last, at);
    if (!inserts.has(at)) inserts.set(at, []);
    inserts.get(at)!.push(b.tag);
  }
  const out: string[] = [];
  if (inserts.has(-1)) out.push(...inserts.get(-1)!);
  lines.forEach((l, i) => {
    out.push(l);
    if (inserts.has(i)) out.push(...inserts.get(i)!);
  });
  return out.join(eol);
}

/**
 * 正文里 tag 的先后变了，书内插图的图片记录（按 slotSeq 对上第几个 tag）跟着改成新序号。
 * 同一个插图 tag 只出现一次时才改；返回有没有改动。
 */
export function renumberBookSlots(mes: string, store: BbiImageStore | undefined, swipeId: number): boolean {
  const bucket = store?.[String(swipeId)];
  if (!bucket) return false;
  const tags = parseImageTags(mes);
  let changed = false;
  tags.forEach((tag, seq) => {
    if (!isBookImageTag(tag)) return;
    if (tags.filter(t => t === tag).length !== 1) return;
    const list = bucket[promptHash(tag)];
    if (!list) return;
    for (const entry of list) {
      if (entry.slotSeq !== seq) {
        entry.slotSeq = seq;
        changed = true;
      }
    }
  });
  return changed;
}

/** 写回之后调用：按楼层当前正文把书内插图的序号对好，有改动就存盘 */
export async function fixBookSlots(
  context: { chat?: Array<{ mes?: string; extra?: Record<string, unknown> }>; saveChat?: () => Promise<void> } | null | undefined,
  floor: number,
  swipeId: number,
): Promise<void> {
  const message = context?.chat?.[floor];
  if (!message) return;
  const store = message.extra?.[BBI_IMAGE_EXTRA_KEY] as BbiImageStore | undefined;
  if (renumberBookSlots(String(message.mes ?? ''), store, swipeId)) await context?.saveChat?.();
}
