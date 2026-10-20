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

/** 把要求里旧的「只画正文」那行换成新的(新行放最前);line 为空 = 去掉那行。 */
export function applyPassageHint(current: string, line: string): string {
  const rest = String(current ?? '')
    .split('\n')
    .filter(l => !l.startsWith(PASSAGE_HINT_PREFIX))
    .join('\n')
    .trim();
  return [line, rest].filter(Boolean).join('\n');
}
