import { ref } from 'vue';

import { prepareTargetText } from '@/autoTag/clean';
import { getContext } from '@/st/context';
import { stripImageTags } from '@/st/imageTagRegex';
import { settings } from '@/state/settings';

/**
 * 「挑正文里的一段」:让用户点选本楼正文的某几段,AI 重写提示词时只画那几段的画面。
 *
 * 段落切法与 runner 单槽重写发给 AI 的完全一致(prepareTargetText,编号 ⟦P1⟧⟦P2⟧…),
 * 所以要求里直接写段落编号,AI 能对上号;再附一小截原文,编号万一对不上也认得出是哪段。
 */

export interface Passage {
  id: string;
  text: string;
}

/** 当前打开的提示词弹窗属于哪一楼。由 openPromptEditor 的钩子设置;PromptEditor 本身不知道楼层。 */
export const passageFloor = ref<number | null>(null);

export function setPassageFloor(floor: number | null): void {
  passageFloor.value = floor;
}

/** 本楼正文按 AI 看到的样子切好的段落;楼不存在或清洗后为空时返回空数组。 */
export function floorPassages(floor: number | null): Passage[] {
  if (floor == null) return [];
  const mes = getContext()?.chat?.[floor]?.mes;
  if (!mes) return [];
  return prepareTargetText(stripImageTags(mes), settings.excludes.customStripTags).segments.map(segment => ({
    id: segment.id,
    text: segment.text,
  }));
}

/** 要求里那一行的固定开头;再挑一次时据此替换旧的一行,而不是越叠越多。 */
export const PASSAGE_HINT_PREFIX = '这张图只画正文';

function snippet(text: string, head = 18, tail = 10): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= head + tail + 4) return flat;
  return `${flat.slice(0, head)}……${flat.slice(-tail)}`;
}

/** 选中的段落 → 一行要求。没选返回空串。 */
export function passageHint(picked: Passage[]): string {
  if (!picked.length) return '';
  const ids = picked.map(p => `⟦${p.id}⟧`).join('');
  // 选得多时只引首尾两段,免得一行要求就把 500 字上限吃光
  const shown = picked.length > 3 ? [picked[0], picked[picked.length - 1]] : picked;
  const quotes = shown.map(p => `「${snippet(p.text)}」`).join(picked.length > 3 ? '……' : '');
  return `${PASSAGE_HINT_PREFIX} ${ids} 这部分描写的画面：${quotes}，不要画别的段落的场景。`;
}

/** 「第 N 张图只画正文」:一次挑好几组、每组一张时的行首;只有一组时仍用 PASSAGE_HINT_PREFIX。 */
const GROUP_LINE = /^(?:这张图|第\d+张图)只画正文/;

/** 每组一行;只有一组时与 passageHint 一字不差(空组跳过)。 */
export function passageGroupsHint(groups: Passage[][]): string {
  const filled = groups.filter(group => group.length);
  if (filled.length <= 1) return passageHint(filled[0] ?? []);
  return filled
    .map((group, i) => passageHint(group).replace(PASSAGE_HINT_PREFIX, `第${i + 1}张图只画正文`))
    .join('\n');
}

/** 要求里每组点名的段落编号(一组一项,按行序);没有这类行返回空数组。 */
export function focusGroups(hint: string | null | undefined): string[][] {
  return String(hint ?? '')
    .split('\n')
    .filter(line => GROUP_LINE.test(line))
    .map(line => [...line.matchAll(/⟦(P\d+)⟧/g)].map(m => m[1]))
    .filter(ids => ids.length);
}

/** 这次要出几张:几组就几张,至少 1。 */
export function focusImageCount(hint: string | null | undefined): number {
  return Math.max(1, focusGroups(hint).length);
}

/** 把要求里旧的「只画正文」那行换成新的(新行放最前);line 为空 = 去掉那行。 */
export function applyPassageHint(current: string, line: string): string {
  const rest = String(current ?? '')
    .split('\n')
    .filter(l => !l.startsWith(PASSAGE_HINT_PREFIX))
    .join('\n')
    .trim();
  return [line, rest].filter(Boolean).join('\n');
}

/**
 * 还没有 tag 的楼「挑一段生图」:发给 AI 的任务备注(接在 runner 的 taskNote 位置)。
 * 与单槽重写不同,这里没有旧画面可锚,只说清楚画哪几段、恰好 1 张、位置落在这几段里。
 */
export function passageTaskNote(hint: string): string {
  const count = focusGroups(hint).length;
  if (count > 1) {
    return [
      `【用户指定了这次要画的 ${count} 组正文段落（优先级最高），每组画 1 张】`,
      hint.trim(),
      `images 数组必须恰好返回 ${count} 项，按顺序第 1 项画第 1 张那组段落、第 2 项画第 2 张那组……；每项的 position 选在它那组段落里，只画那组段落的场景，几张之间不要画成同一个画面。`,
    ].join('\n');
  }
  return [
    '【用户指定了这次要画的正文段落（优先级最高）】',
    hint.trim(),
    '只为这部分正文画 1 张图：images 数组必须恰好返回 1 项，position 选在用户指定的段落里，不要画其它段落的场景。',
  ].join('\n');
}

/**
 * 楼层「重新生成」不指定段落时:用户填的「最多几张」覆盖设置里的上限(不设封顶),
 * 下限跟着收,免得下限比上限还大。没填就原样用设置。
 */
export function regenImageOptions<T extends { minImages: number; maxImages: number }>(base: T, count: number | undefined): T {
  const max = Math.floor(Number(count));
  if (!Number.isFinite(max) || max < 1) return base;
  return { ...base, maxImages: max, minImages: Math.min(Math.max(0, Math.floor(Number(base.minImages)) || 0), max) };
}
