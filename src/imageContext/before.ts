import { prepareTargetText } from '@/autoTag/clean';
import { imageAnchors } from '@/rewriteHint/move';
import { stripImageTags } from '@/st/imageTagRegex';

/**
 * 大图下面显示「这张图前面的几段正文」(本 fork 新增),方便对照图和文字是否匹配。
 * 段落口径与挑段落、重写提示词一致(stripImageTags 后 prepareTargetText 切段)。
 */

export interface ImageContextText {
  /** 图前面的几段,按正文顺序;最后一段紧挨着图。 */
  passages: string[];
  /** 图插在正文开头(前面没有段落)。 */
  atStart: boolean;
}

/** 每段最多显示几个字:太长只留靠近图的结尾。 */
export const CONTEXT_PASSAGE_CHARS = 160;

function tail(text: string, max: number): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

/** 本楼第 seq 张图前面最多 count 段;找不到这张图返回 null。 */
export function textBeforeImage(mes: string, seq: number, stripTags: string[], count = 3): ImageContextText | null {
  const anchor = imageAnchors(mes ?? '', stripTags).find(a => a.seq === seq);
  if (!anchor) return null;
  if (!anchor.passageId) return { passages: [], atStart: true };
  const segments = prepareTargetText(stripImageTags(mes), stripTags).segments;
  const at = segments.findIndex(s => s.id === anchor.passageId);
  if (at < 0) return null;
  return {
    passages: segments.slice(Math.max(0, at - count + 1), at + 1).map(s => tail(s.text, CONTEXT_PASSAGE_CHARS)),
    atStart: false,
  };
}
