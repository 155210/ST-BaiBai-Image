import { promptHash, type BbiImageStore } from '@/floor/storage';

/**
 * 一张图(一个槽位)用过的提示词版本(本 fork 独有)。
 *
 * 出过图的提示词本来就存着:每条图片记录带着当时的 tag 原文(storage.ts 的 entry.prompt),
 * 按 promptHash 分桶。改提示词只是换了正文里的 tag,旧桶原样留着——所以「回到改之前」
 * 就是把旧桶里那条 tag 写回正文,卡片按 hash 自然又显示那几张旧图。
 *
 * 没出过图就被改掉的提示词不在图片记录里,另记在消息 extra 的 bbiPromptMemo 下
 * (只记这种,出过图的不重复存)。旧聊天没有这个键,读不到就当空,什么都不会坏。
 */

export const PROMPT_MEMO_KEY = 'bbiPromptMemo';
const MAX_MEMO = 10;

export interface MemoItem {
  prompt: string;
  at: number;
}
/** swipeId → 槽位序号 → 改掉的提示词(旧的在前)。 */
export type PromptMemo = Record<string, Record<string, MemoItem[]>>;

export interface PromptVersion {
  hash: string;
  /** tag 原文(含 <bbi_image> 壳),写回正文用 */
  prompt: string;
  /** 这版出过几张图 */
  count: number;
  /** 这版最新一张图 */
  thumb?: string;
  lastAt: number;
}

function isMemoItem(value: unknown): value is MemoItem {
  return !!value && typeof (value as MemoItem).prompt === 'string' && typeof (value as MemoItem).at === 'number';
}

/** 读出某个槽位记下的提示词;键不在或格式不对一律当空。 */
export function memoItems(extra: Record<string, unknown> | undefined, swipeId: number, seq: number): MemoItem[] {
  const memo = extra?.[PROMPT_MEMO_KEY];
  if (!memo || typeof memo !== 'object') return [];
  const list = (memo as Record<string, Record<string, unknown>>)[String(swipeId)]?.[String(seq)];
  return Array.isArray(list) ? list.filter(isMemoItem) : [];
}

function hasImages(store: BbiImageStore | null, swipeId: number, seq: number, hash: string): boolean {
  return (store?.[String(swipeId)]?.[hash] ?? []).some(entry => (entry.slotSeq ?? 0) === seq);
}

/**
 * 记下要被改掉的提示词,返回新的 memo;不用记(出过图、或已经记过)返回 undefined。
 * 不改传入的对象。
 */
export function rememberedMemo(
  extra: Record<string, unknown> | undefined,
  store: BbiImageStore | null,
  swipeId: number,
  seq: number,
  prompt: string,
  now = Date.now(),
): PromptMemo | undefined {
  if (!prompt || hasImages(store, swipeId, seq, promptHash(prompt))) return undefined;
  const old = memoItems(extra, swipeId, seq);
  if (old.some(item => item.prompt === prompt)) return undefined;
  const raw = extra?.[PROMPT_MEMO_KEY];
  const memo: PromptMemo = raw && typeof raw === 'object' ? (raw as PromptMemo) : {};
  return {
    ...memo,
    [String(swipeId)]: {
      ...(memo[String(swipeId)] ?? {}),
      [String(seq)]: [...old, { prompt, at: now }].slice(-MAX_MEMO),
    },
  };
}

/** 这个槽位除了现在这版以外用过的提示词,最近用过的在前。 */
export function slotVersions(
  store: BbiImageStore | null,
  extra: Record<string, unknown> | undefined,
  swipeId: number,
  seq: number,
  currentTag: string,
): PromptVersion[] {
  const current = promptHash(currentTag);
  const versions = new Map<string, PromptVersion>();
  for (const [hash, list] of Object.entries(store?.[String(swipeId)] ?? {})) {
    if (hash === current || !Array.isArray(list)) continue;
    const mine = list.filter(entry => (entry.slotSeq ?? 0) === seq && typeof entry.prompt === 'string' && entry.prompt);
    if (!mine.length) continue;
    const ready = mine.filter(entry => entry.status === 'ready' && entry.path);
    const latest = mine.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    versions.set(hash, {
      hash,
      prompt: latest.prompt,
      count: ready.length,
      thumb: ready.reduce<(typeof ready)[number] | undefined>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), undefined)
        ?.path,
      lastAt: latest.createdAt,
    });
  }
  for (const item of memoItems(extra, swipeId, seq)) {
    const hash = promptHash(item.prompt);
    if (hash === current) continue;
    const known = versions.get(hash);
    if (known) known.lastAt = Math.max(known.lastAt, item.at);
    else versions.set(hash, { hash, prompt: item.prompt, count: 0, lastAt: item.at });
  }
  return [...versions.values()].sort((a, b) => b.lastAt - a.lastAt);
}

function tagList(prompt: string): string[] {
  const inner = prompt.replace(/^<bbi_image[^>]*>/i, '').split(/<(?:nl|negative|characters|size)>/i)[0] ?? '';
  return inner
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean);
}

/** 旧版比现在多了哪些 tag、少了哪些(只比短 tag 部分),方便一眼认出是哪一版。 */
export function tagDiff(currentTag: string, oldTag: string): { added: string[]; removed: string[] } {
  const now = new Set(tagList(currentTag));
  const old = new Set(tagList(oldTag));
  return {
    added: [...old].filter(tag => !now.has(tag)),
    removed: [...now].filter(tag => !old.has(tag)),
  };
}
