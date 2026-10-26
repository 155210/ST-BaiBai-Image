import { getContext } from '@/st/context';
import { parseImageTagContent, parseImageTags, stripImageTags } from '@/st/imageTagRegex';
import { settings } from '@/state/settings';
import { prepareTargetText } from '@/autoTag/clean';

import { focusGroups } from './passage';

/**
 * 记下每张图是按哪几段正文出的(本 fork 独有),「再加图」时把那几段标出来。
 *
 * 存在消息 extra[SOURCES_KEY][swipeId][key] = 段落原文数组。key 取自提示词内容
 * (tag + nl 的短哈希),不用楼内序号——再加图时序号会平移,提示词不会;
 * 提示词被改写后对不上就当没记过(画面可能已经变了)。存原文不存编号,正文前面加了段也认得出。
 */

export const SOURCES_KEY = 'bbiPassageSources';

type SourceStore = Record<string, Record<string, string[]>>;

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const flat = (text: string | undefined) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** 一张图的记号:提示词 tag + nl。 */
export function sourceKey(content: { tag: string; nl?: string }): string {
  return hash(`${flat(content.tag)}\u0001${flat(content.nl)}`);
}

interface PendingSources {
  floor: number;
  images: Array<{ tag: string; nl?: string }>;
  texts: string[][];
}

let pending: PendingSources | null = null;

/**
 * runner 把图钉到所选段落后调用(pinFocusPosition 之后):先记下每张图对应哪组段落的原文。
 * 图对象留引用,提示词在写回前还会被 runner 改(@替换等),真正的记号写回那一刻再算。
 */
export function rememberFocusSources(
  floor: number,
  images: Array<{ tag: string; nl?: string; position: string }>,
  segments: Array<{ id: string; text: string }>,
  focus: string | undefined,
): void {
  const groups = focusGroups(focus);
  pending = groups.length
    ? {
        floor,
        images,
        texts: images.map(image => {
          const ids = groups.find(g => g.includes(image.position)) ?? [];
          return ids.map(id => segments.find(s => s.id === id)?.text ?? '').filter(Boolean);
        }),
      }
    : null;
}

/** 写回那一刻(runner 的 buildNext 里)把记下的段落落到消息 extra 上,随这次保存一起存盘。 */
export function commitFocusSources(floor: number, swipeId: number): void {
  const job = pending && pending.floor === floor ? pending : null;
  pending = null;
  if (!job) return;
  const entries = job.images.map((image, i) => [sourceKey(image), job.texts[i]] as const).filter(([, t]) => t.length);
  writeSources(floor, swipeId, entries);
}

/** 卡片上挑段落重写一张后:记下新提示词对应的段落。 */
export function recordSlotSources(floor: number, swipeId: number, rawTag: string, texts: string[]): void {
  if (texts.length) writeSources(floor, swipeId, [[sourceKey(parseImageTagContent(rawTag)), texts]]);
}

function writeSources(floor: number, swipeId: number, entries: ReadonlyArray<readonly [string, string[]]>): void {
  const message = getContext()?.chat?.[floor];
  if (!message || !entries.length) return;
  const store = (message.extra?.[SOURCES_KEY] as SourceStore | undefined) ?? {};
  // 只留本楼当前还在的图,删掉的、改写过的不越攒越多
  const alive = new Set(parseImageTags(String(message.mes ?? '')).map(raw => sourceKey(parseImageTagContent(raw))));
  const bucket = Object.fromEntries(Object.entries(store[String(swipeId)] ?? {}).filter(([key]) => alive.has(key)));
  for (const [key, texts] of entries) bucket[key] = texts;
  message.extra = { ...(message.extra ?? {}), [SOURCES_KEY]: { ...store, [String(swipeId)]: bucket } };
}

/**
 * 本楼(当前 swipe)第几张图是按哪几段出的:返回 段落 id → 那几张的序号(1 起)。
 * 段落按原文对上用户现在看到的编号;对不上(那段被改过)就不标。
 */
export function drawnPassages(floor: number): Record<string, number[]> {
  const message = getContext()?.chat?.[floor];
  if (!message?.mes) return {};
  const bucket = (message.extra?.[SOURCES_KEY] as SourceStore | undefined)?.[String(message.swipe_id ?? 0)] ?? {};
  const segments = prepareTargetText(stripImageTags(message.mes), settings.excludes.customStripTags).segments;
  const out: Record<string, number[]> = {};
  parseImageTags(message.mes).forEach((raw, seq) => {
    for (const text of bucket[sourceKey(parseImageTagContent(raw))] ?? []) {
      const id = segments.find(s => s.text === text)?.id;
      if (id) (out[id] ??= []).push(seq + 1);
    }
  });
  return out;
}
