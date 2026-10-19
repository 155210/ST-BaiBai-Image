import { reactive } from 'vue';

import { IMAGE_TAG_FIND_REGEX } from '@/st/imageTagRegex';
import { isAiStoryMessage, type STMessage } from '@/st/context';

/**
 * 角色搜索:某个名字在本聊天哪些楼出现过、第一次是哪楼、几个名字同时出现在哪些楼。
 *
 * 搜的是原文 mes(不受显示正则影响,被隐藏的旧楼也搜得到)。只算正文:
 * 生图 tag、HTML 注释、思维链、排除标签里的内容都不算出现。
 * ST 原生推理存在 extra.reasoning,本来就不在 mes 里;这里处理的是写进正文的 <think> 之类。
 */

/** 内置排除的思维链标签。 */
export const BUILTIN_STRIP_TAGS = ['think', 'thinking', 'reasoning', 'reflection', 'analysis'];

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 有逗号/顿号/分号/竖线/换行就只按它们分(保留英文名里的空格),否则按空格分。去空去重。 */
export function splitNames(text: string): string[] {
  const trimmed = String(text ?? '').trim();
  const parts = /[,，、;；|\n]/.test(trimmed) ? trimmed.split(/[,，、;；|\n]+/) : trimmed.split(/\s+/);
  return [...new Set(parts.map(part => part.trim()).filter(Boolean))];
}

/** 排除标签名单:内置思维链 + 插件设置里的「自定义清洗标签」+ 这里额外填的。去掉尖括号、去重。 */
export function stripTagList(...lists: string[][]): string[] {
  const all = [BUILTIN_STRIP_TAGS, ...lists].flat();
  return [
    ...new Set(
      all
        .map(tag => String(tag).trim().replace(/^<\/?/, '').replace(/\/?>$/, ''))
        .filter(Boolean),
    ),
  ];
}

/** 搜索前的清洗。 */
export function searchableText(mes: string, stripTags: string[]): string {
  let text = String(mes ?? '')
    .replace(new RegExp(IMAGE_TAG_FIND_REGEX.source, 'gi'), '')
    .replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of stripTags) {
    const name = escapeRegex(tag);
    text = text.replace(new RegExp(`<${name}(?=[\\s>/])[^>]*>[\\s\\S]*?</${name}\\s*>`, 'gi'), '');
    // 落单标签的兜底只对思维链做,别误删正文
    if (!BUILTIN_STRIP_TAGS.includes(tag.toLowerCase())) continue;
    // 只有闭标签(预填充把开标签吃掉了):闭标签之前全算思维链
    const close = new RegExp(`</${name}\\s*>`, 'i').exec(text);
    if (close) text = text.slice(close.index + close[0].length);
    // 只有开标签(输出被截断):开标签之后全丢
    const open = new RegExp(`<${name}(?=[\\s>/])[^>]*>`, 'i').exec(text);
    if (open) text = text.slice(0, open.index);
  }
  return text;
}

export interface NameHits {
  name: string;
  /** 出现过的楼号,升序。 */
  floors: number[];
}

export interface SearchResult {
  /** 每个名字一组,按首次出场先后排(没出现过的排最后)。 */
  rows: NameHits[];
  /** 所有名字都出现过的楼(只有一个名字时为空)。 */
  together: number[];
}

export function searchNames(
  chat: STMessage[],
  names: string[],
  options: { withUser: boolean; stripTags: string[] },
): SearchResult {
  const unique = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  const needles = unique.map(name => name.toLowerCase());
  const hits = unique.map(() => [] as number[]);
  const together: number[] = [];
  chat.forEach((message, floor) => {
    if (!message || typeof message.mes !== 'string') return;
    if (message.is_user ? !options.withUser : !isAiStoryMessage(message)) return;
    const text = searchableText(message.mes, options.stripTags).toLowerCase();
    let all = true;
    needles.forEach((needle, index) => {
      if (text.includes(needle)) hits[index].push(floor);
      else all = false;
    });
    if (all && unique.length > 1) together.push(floor);
  });
  const rows = unique
    .map((name, index) => ({ name, floors: hits[index] }))
    .sort((left, right) => (left.floors[0] ?? Infinity) - (right.floors[0] ?? Infinity));
  return { rows, together };
}

/**
 * 搜索框与结果放在模块里而不是组件里:关掉柏宝绘窗口、切到别的页再回来,组件会重建,
 * 放组件里就会被清空。只在内存里,刷新页面才清。
 */
export const searchState = reactive({
  query: '',
  withUser: false,
  /** 上次搜的名字(换聊天后用它自动重搜)。 */
  names: [] as string[],
  result: null as SearchResult | null,
});
