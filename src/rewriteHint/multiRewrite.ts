import { formatPromptText, parseImageTagContent, parseImageTags, replaceImageTagAt } from '@/st/imageTagRegex';

import { normalizeRewriteHint } from './hint';
import { clearPendingMove } from './move';

/**
 * 同一楼「一起改几张」(本 fork 独有):每张写各自的修改要求,一次发给 AI,一起写回、一起重出。
 *
 * 走 runner 的单槽重写那条路(slot.many):分析基底、不落 changes、写回原位替换都与单张一致,
 * 只是协议要求恰好返回几张、按顺序对应。原位替换不挪位置,楼内序号不变,图片记录也不用动。
 */

export interface SlotEdit {
  /** 楼内第几个 tag(0-based) */
  seq: number;
  /** 用户写的修改要求 */
  hint: string;
}

/** 弹窗交来的要求整理一遍:去掉空的、重复的,按楼内顺序排。 */
export function normalizeSlotEdits(edits: SlotEdit[]): SlotEdit[] {
  const seen = new Set<number>();
  return edits
    .map(e => ({ seq: e.seq, hint: normalizeRewriteHint(e.hint) }))
    .filter(e => e.hint && !seen.has(e.seq) && seen.add(e.seq))
    .sort((a, b) => a.seq - b.seq);
}

const oneLine = (raw: string) => formatPromptText(parseImageTagContent(raw)).replace(/\s*\n+\s*/g, ' / ').trim();

/** 发给 AI 的任务备注(接在 runner 的 taskNote 位置)。 */
export function manySlotTaskNote(rawSource: string, edits: SlotEdit[]): string {
  const tags = parseImageTags(rawSource ?? '');
  const lines = [
    `【本次重写本楼其中 ${edits.length} 张的提示词，每张都有用户写的修改要求（优先级最高）】`,
    `images 数组必须恰好返回 ${edits.length} 项，顺序与下面一一对应：${edits.map((e, i) => `第 ${i + 1} 项 = 第 ${e.seq + 1} 张`).join('，')}。`,
    '每张仍然画它原来那个瞬间，不要挪到正文别处；按它的修改要求改写提示词，要求与「保持原画面」冲突时以要求为准，要求没提到的部分照旧依据正文、保持原样。',
  ];
  edits.forEach((e, i) => {
    lines.push('', `第 ${i + 1} 项 → 第 ${e.seq + 1} 张`, '当前提示词：', formatPromptText(parseImageTagContent(tags[e.seq] ?? '')).trim() || '（无）', '用户的修改要求：', e.hint);
  });
  const others = tags.map((raw, i) => (edits.some(e => e.seq === i) ? '' : `- 第 ${i + 1} 张：${oneLine(raw).slice(0, 160)}`)).filter(Boolean);
  if (others.length) lines.push('', '本楼其余画面（不改，也不要把它们的画面抢过来）：', ...others);
  return lines.join('\n');
}

/**
 * 写回:把这几张按序号原位换成新提示词。开跑时的原文(rawSource)里这几条 tag
 * 与落盘那一刻对不上(期间被改过、换了 swipe)就整次放弃,返回 null。
 */
export function replaceManySlots(currentText: string, rawSource: string, edits: SlotEdit[], nextTags: string[]): string | null {
  clearPendingMove();
  const before = parseImageTags(rawSource);
  const now = parseImageTags(currentText);
  if (nextTags.length !== edits.length || edits.some(e => now[e.seq] === undefined || now[e.seq] !== before[e.seq])) return null;
  let text: string | null = currentText;
  edits.forEach((e, i) => {
    if (text !== null) text = replaceImageTagAt(text, e.seq, nextTags[i]);
  });
  return text;
}

/** 一次改了哪几张(出图标记、撤标记用)。 */
export function slotSeqs(slot: { seq: number; many?: SlotEdit[] }): number[] {
  return slot.many?.length ? slot.many.map(e => e.seq) : [slot.seq];
}
