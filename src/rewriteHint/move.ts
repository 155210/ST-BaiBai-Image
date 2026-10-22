import { prepareTargetText } from '@/autoTag/clean';
import { consumeAutoGenerate, markForAutoGenerate } from '@/floor/autoGenerate';
import { getGenRecord, slotKey } from '@/floor/genState';
import { BBI_IMAGE_EXTRA_KEY, type BbiImageStore } from '@/floor/storage';
import type { MessageExtraUpdate } from '@/st/messageEdit';
import { getContext } from '@/st/context';
import { replaceImageTagAt, stripImageTags } from '@/st/imageTagRegex';
import { settings } from '@/state/settings';

import { focusGroups, PASSAGE_HINT_PREFIX } from './passage';

/**
 * 「挑正文里的一段」重写后,把这张图挪到所选段落后面(本 fork 独有)。
 *
 * 上游的单槽重写按 seq 原位替换,画面换了位置却不动,用户看着就是「图还在原地」。
 * 这里在写回那一刻:删掉原位置的 tag,插到所选最后一段的那一行后面。
 *
 * 【图片不能丢】图片记录按 promptHash + slotSeq(楼内第几个 tag)认领。tag 换了位置,
 * 夹在中间的其它 tag 的序号都会平移——所以同一次写回里把本楼(当前 swipe)所有图片记录的
 * slotSeq 一起重排,正文与记录同进同退(applyMessageText 保存失败时两者一起回滚)。
 * 本楼还有图在排队/生成时不挪:那些任务收尾时会按旧序号落盘,挪了就对不上号。
 */

/** 要求里「这张图只画正文」那一行点名的段落编号,按出现顺序;没有这行返回空数组。 */
export function pickedPassageIds(hint: string | null | undefined): string[] {
  const line = String(hint ?? '')
    .split('\n')
    .find(l => l.startsWith(PASSAGE_HINT_PREFIX));
  if (!line) return [];
  return [...line.matchAll(/⟦(P\d+)⟧/g)].map(m => m[1]);
}

/** tag 原文换成等长空白(换行保留):段落的行号不变,tag 所在行清洗后为空、不算段落。 */
function maskTags(text: string): string {
  return text.replace(/<bbi_image>[\s\S]+?<\/bbi_image>/gi, m => m.replace(/[^\r\n]/g, ' '));
}

/**
 * 段落编号 → text 里那段所在的行号(0-based)。编号按用户看到的口径
 * (stripImageTags 后切段)解释,再按段落原文对回 text 里的行,两边对不上返回 null。
 */
export function passageLine(text: string, id: string, stripTags: string[]): number | null {
  const shown = prepareTargetText(stripImageTags(text), stripTags).segments.find(s => s.id === id);
  if (!shown) return null;
  const segments = prepareTargetText(maskTags(text), stripTags).segments;
  const hit = segments.find(s => s.id === id && s.text === shown.text) ?? segments.find(s => s.text === shown.text);
  return hit ? hit.sourceLine : null;
}

/** 第 line 行(0-based)行尾的字符偏移;越界返回 null。 */
function lineEnd(text: string, line: number): number | null {
  const newline = /\r\n|\n|\r/g;
  let current = 0;
  for (let match = newline.exec(text); match; match = newline.exec(text)) {
    if (current === line) return match.index;
    current += 1;
  }
  return current === line ? text.length : null;
}

function eolOf(text: string): string {
  return /\r\n|\n|\r/.exec(text)?.[0] ?? '\n';
}

/**
 * 删掉第 seq 个 tag,把 nextTag 插到 passageId 那段的行尾之后。
 * 返回新正文与新序号;任何一步对不上返回 null(调用方退回原位替换)。
 */
export function moveTagAfterPassage(
  text: string,
  seq: number,
  nextTag: string,
  passageId: string,
  stripTags: string[],
): { text: string; seq: number } | null {
  const spans = [...text.matchAll(/<bbi_image>[\s\S]+?<\/bbi_image>/gi)];
  const span = spans[seq];
  if (!span || span.index === undefined) return null;
  let start = span.index;
  let end = start + span[0].length;
  // 连同它前面那个换行一起删(注入时就是「换行 + tag」接在段落行尾);前面没有就删后面的
  const before = /(?:\r\n|\n|\r)$/.exec(text.slice(0, start));
  if (before) start -= before[0].length;
  else {
    const after = /^(?:\r\n|\n|\r)/.exec(text.slice(end));
    if (after) end += after[0].length;
  }
  const removed = text.slice(0, start) + text.slice(end);

  const line = passageLine(removed, passageId, stripTags);
  if (line === null) return null;
  const at = lineEnd(removed, line);
  if (at === null) return null;
  const out = `${removed.slice(0, at)}${eolOf(removed)}${nextTag}${removed.slice(at)}`;
  const newSeq = [...removed.slice(0, at).matchAll(/<bbi_image>[\s\S]+?<\/bbi_image>/gi)].length;
  return { text: out, seq: newSeq };
}

/** tag 从 from 挪到 to 之后,原来第 i 个 tag 现在是第几个。 */
export function shiftedSeq(i: number, from: number, to: number): number {
  if (i === from) return to;
  const without = i > from ? i - 1 : i;
  return without >= to ? without + 1 : without;
}

/** 本楼当前 swipe 的图片记录按新序号重排 slotSeq(返回新对象,不改原记录)。 */
export function remapStore(store: BbiImageStore | undefined, swipeId: number, from: number, to: number): BbiImageStore | undefined {
  if (!store || from === to) return store;
  const bucket = store[String(swipeId)];
  if (!bucket) return store;
  const next: Record<string, BbiImageStore[string][string]> = {};
  for (const [hash, list] of Object.entries(bucket)) {
    next[hash] = list.map(entry => ({ ...entry, slotSeq: shiftedSeq(entry.slotSeq ?? 0, from, to) }));
  }
  return { ...store, [String(swipeId)]: next };
}

/* —— runner / 提示词弹窗的接入 —— */

interface PendingMove {
  floor: number;
  store: BbiImageStore | undefined;
}

let pending: PendingMove | null = null;
/** 挪过位置的槽位:旧 key → 新序号。提示词弹窗收尾时据此跟到新位置。 */
const moved = new Map<string, number>();

function floorBusy(chatId: string, floor: number, swipeId: number, count: number): boolean {
  for (let i = 0; i < count; i += 1) {
    const phase = getGenRecord(slotKey(chatId, floor, swipeId, i))?.phase;
    if (phase === 'queued' || phase === 'generating') return true;
  }
  return false;
}

/**
 * runner 单槽写回(buildNext 里)调用:要求里挑了段落就挪,否则与上游一样原位替换。
 * 挪了的话顺手把出图标记移到新序号,图片记录的重排留给 slotExtraUpdate 落盘。
 */
export function placeSlotTag(
  currentText: string,
  at: { chatId: string; floor: number; swipeId: number; seq: number },
  nextTag: string,
  hint: string | undefined,
): string | null {
  pending = null;
  const ids = pickedPassageIds(hint);
  const target = ids[ids.length - 1];
  const count = [...currentText.matchAll(/<bbi_image>[\s\S]+?<\/bbi_image>/gi)].length;
  const result =
    target && !floorBusy(at.chatId, at.floor, at.swipeId, count)
      ? moveTagAfterPassage(currentText, at.seq, nextTag, target, settings.excludes.customStripTags)
      : null;
  if (!result) return replaceImageTagAt(currentText, at.seq, nextTag);
  if (result.seq !== at.seq) {
    const store = getContext()?.chat?.[at.floor]?.extra?.[BBI_IMAGE_EXTRA_KEY] as BbiImageStore | undefined;
    pending = { floor: at.floor, store: remapStore(store, at.swipeId, at.seq, result.seq) };
    const mode = consumeAutoGenerate(at.chatId, at.floor, at.swipeId, at.seq);
    if (mode) markForAutoGenerate(at.chatId, at.floor, at.swipeId, result.seq, mode);
    moved.set(slotKey(at.chatId, at.floor, at.swipeId, at.seq), result.seq);
  }
  return result.text;
}

/**
 * 单槽写回的 extra 更新:值在 applyMessageText 用到时才取(那时 buildNext 已跑完)。
 * 没挪 = 原样写回当前记录,等于没动。
 */
export function slotExtraUpdate(floor: number): MessageExtraUpdate {
  // applyMessageText 会读 value 不止一次(先判 undefined 再赋值):第一次取到就定下来
  let settled = false;
  let value: unknown;
  return {
    key: BBI_IMAGE_EXTRA_KEY,
    get value() {
      if (!settled) {
        settled = true;
        const move = pending && pending.floor === floor ? pending : null;
        pending = null;
        value = move ? move.store : getContext()?.chat?.[floor]?.extra?.[BBI_IMAGE_EXTRA_KEY];
      }
      return value;
    },
  };
}

/** 提示词弹窗收尾:这一槽被挪过就把 at.seq 改成新序号(原地改,弹窗后续读写都跟过去)。 */
export function followMovedSlot(at: { chatId: string; messageId: number; swipeId: number; seq: number }): void {
  const key = slotKey(at.chatId, at.messageId, at.swipeId, at.seq);
  const next = moved.get(key);
  if (next === undefined) return;
  moved.delete(key);
  at.seq = next;
}

/**
 * 「挑一段生图」:不管模型把 position 放哪,都钉到所选那组的最后一段。
 * 一次挑了好几组时每张对一组:模型放在哪组里就归哪组,没放进任何组的按顺序补空着的组。
 * segments 是 runner 发给 AI 的那份(编号与用户看到的一致)。
 */
export function pinFocusPosition(
  images: Array<{ position: string; sourceLine: number }>,
  segments: Array<{ id: string; sourceLine: number }>,
  focus: string | undefined,
): void {
  const groups = focusGroups(focus);
  if (!groups.length) return;
  const owner = images.map(image => groups.findIndex(ids => ids.includes(image.position)));
  const taken = new Set<number>();
  owner.forEach((g, i) => {
    if (g < 0 || taken.has(g)) owner[i] = -1;
    else taken.add(g);
  });
  const free = groups.map((_, g) => g).filter(g => !taken.has(g));
  images.forEach((image, i) => {
    // 组比图少(只该出现在单组时)就都钉到最后一组
    const g = owner[i] >= 0 ? owner[i] : (free.shift() ?? groups.length - 1);
    const ids = groups[g];
    const target = segments.find(s => s.id === ids[ids.length - 1]);
    if (!target) return;
    image.position = target.id;
    image.sourceLine = target.sourceLine;
  });
}

/* —— 已有图的楼「再加一张」—— */

/** 加图的出图标记落在哪些序号(写回失败时撤掉)。 */
let addedMarks: Array<{ chatId: string; floor: number; swipeId: number; seq: number }> = [];

/**
 * 已有图的楼再加几张:每张新 tag 插到它那组段落(passageId)后面,原有 tag 和图一张不动。
 * 插在中间时后面那些 tag 的序号都要 +1,图片记录同一次写回里一起重排(见 slotExtraUpdate);
 * 本楼还有图在排队/生成、或段落对不上时,放到楼尾(序号不变,谁也不用挪)。
 * 新图的最终序号上挂 force 出图标记。runner 的 buildNext 里调用。
 */
export function addFocusedTags(
  currentText: string,
  at: { chatId: string; floor: number; swipeId: number },
  added: Array<{ tag: string; passageId: string }>,
): string {
  pending = null;
  const original = getContext()?.chat?.[at.floor]?.extra?.[BBI_IMAGE_EXTRA_KEY] as BbiImageStore | undefined;
  let store = original;
  let text = currentText;
  const count = [...currentText.matchAll(/<bbi_image>[\s\S]+?<\/bbi_image>/gi)].length;
  const busy = floorBusy(at.chatId, at.floor, at.swipeId, count);
  const seqs: number[] = [];
  for (const { tag, passageId } of added) {
    const total = count + seqs.length;
    const appended = `${text}${eolOf(text)}${tag}`;
    const result = !busy ? moveTagAfterPassage(appended, total, tag, passageId, settings.excludes.customStripTags) : null;
    const seq = result ? result.seq : total;
    if (seq !== total) {
      store = remapStore(store, at.swipeId, total, seq);
      for (let i = 0; i < seqs.length; i++) seqs[i] = shiftedSeq(seqs[i], total, seq);
    }
    seqs.push(seq);
    text = result ? result.text : appended;
  }
  if (store !== original) pending = { floor: at.floor, store };
  addedMarks = seqs.map(seq => ({ ...at, seq }));
  for (const seq of seqs) markForAutoGenerate(at.chatId, at.floor, at.swipeId, seq, 'force');
  return text;
}

/** 只加一张(按要求里「这张图只画正文」那行的最后一段)。 */
export function addFocusedTag(
  currentText: string,
  at: { chatId: string; floor: number; swipeId: number },
  nextTag: string,
  hint: string | undefined,
): string {
  const ids = pickedPassageIds(hint);
  return addFocusedTags(currentText, at, [{ tag: nextTag, passageId: ids[ids.length - 1] ?? '' }]);
}

/** 加图没写成:撤掉刚挂的出图标记。 */
export function dropAddedMark(): void {
  for (const mark of addedMarks) consumeAutoGenerate(mark.chatId, mark.floor, mark.swipeId, mark.seq);
  addedMarks = [];
}

/** 等本楼正在排队/生成的图收尾(最多 maxMs),好把新图插到段落后面而不是楼尾。 */
export async function waitFloorIdle(floor: number, maxMs = 120_000): Promise<void> {
  const context = getContext();
  const chatId = context?.getCurrentChatId?.() ?? '';
  const message = context?.chat?.[floor];
  if (!chatId || !message) return;
  const swipeId = message.swipe_id ?? 0;
  const count = [...String(message.mes ?? '').matchAll(/<bbi_image>[\s\S]+?<\/bbi_image>/gi)].length;
  const until = Date.now() + maxMs;
  while (floorBusy(chatId, floor, swipeId, count) && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
