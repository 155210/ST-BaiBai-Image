import { requestCompletion, requestViaMainApi, type ChatMsg } from '@/api/client';
import type { ImageCharacterPrompt } from '@/autoTag/protocol';
import { getTagGenChannel } from '@/state/settings';
import { containsTagMarkup, type ImageTagContent } from '@/st/imageTagRegex';

/**
 * 「只改提示词」(本 fork 独有):不发正文、不带角色卡和预设,只把这张图现在的提示词
 * 和用户写的修改要求发给写 tag 的那个 AI,改好的结果填回编辑框,用户看过再自己点「应用」。
 * 走的渠道与「AI 重写提示词」相同(副 API,没配就跟随主 API)。
 */

const SYSTEM = [
  '你是 AI 绘图提示词的修改助手。用户会给你一张图现在的提示词(JSON)和修改要求。',
  '只按要求改,要求没提到的部分一字不动地保留。',
  '字段说明:',
  '- tag:画面的英文 danbooru 短 tag,逗号分隔(必填)。',
  '- nl:画面的英文自然语言描述;原来是空串就保持空串。',
  '- negative:这张图额外的负面提示词;原来是空串且要求没提就保持空串。',
  '- characters:各角色 [{name, tag, nl}],name 不要改,要改角色外貌、动作就改对应角色的 tag / nl。',
  '- size:portrait(竖图)或 landscape(横图)。',
  '任何字段里都不要出现 <bbi_image>、<tag>、<nl>、<negative>、<characters>、<size> 这类标签。',
  '只输出改好的完整 JSON 对象(字段和输入一样),不要解释,不要代码块。',
].join('\n');

export function promptOnlyMessages(content: ImageTagContent, hint: string): ChatMsg[] {
  const current = {
    tag: content.tag,
    nl: content.nl,
    negative: content.negative,
    characters: content.characters.map(({ name, tag, nl }) => ({ name, tag, nl })),
    size: content.size,
  };
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `现在的提示词:\n${JSON.stringify(current, null, 2)}\n\n修改要求:\n${hint.trim()}` },
  ];
}

function oneLine(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim().replace(/[\r\n]+/g, ' ') : fallback;
}

/** 解析 AI 的回复;缺的字段沿用原来的,格式不对抛错(带一句人话)。 */
export function parsePromptOnlyReply(raw: string, original: ImageTagContent): ImageTagContent {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回改好的提示词');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('AI 返回的提示词格式不对，没法读取');
  }
  const characters: ImageCharacterPrompt[] = Array.isArray(data.characters)
    ? data.characters
        .map(item => {
          const c = (item ?? {}) as Record<string, unknown>;
          return { name: oneLine(c.name, ''), tag: oneLine(c.tag, ''), nl: oneLine(c.nl, '') };
        })
        .filter(c => c.name && c.tag)
    : original.characters.map(c => ({ ...c }));
  const next: ImageTagContent = {
    tag: oneLine(data.tag, original.tag),
    nl: oneLine(data.nl, original.nl),
    negative: oneLine(data.negative, original.negative),
    characters,
    size: data.size === 'portrait' || data.size === 'landscape' ? data.size : original.size,
  };
  if (!next.tag) throw new Error('AI 返回的画面 tag 是空的');
  const all = [next.tag, next.nl, next.negative, ...characters.flatMap(c => [c.name, c.tag, c.nl])];
  if (all.some(value => value && containsTagMarkup(value))) throw new Error('AI 返回的提示词里夹了标签');
  return next;
}

/** 发请求并解析;解析不过算这次请求失败(请求历史里如实记失败)。 */
export async function editPromptOnly(
  content: ImageTagContent,
  hint: string,
  signal: AbortSignal,
): Promise<ImageTagContent> {
  const messages = promptOnlyMessages(content, hint);
  const parsed: { value: ImageTagContent | null } = { value: null };
  const validate = (raw: string) => {
    parsed.value = parsePromptOnlyReply(raw, content);
  };
  const channel = getTagGenChannel();
  const opts = { signal, source: '只改提示词（不发正文）', validate };
  if (channel) await requestCompletion(channel, messages, opts);
  else await requestViaMainApi(messages, opts);
  if (!parsed.value) throw new Error('AI 没有返回改好的提示词');
  return parsed.value;
}
