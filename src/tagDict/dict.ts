/**
 * 标签库(Danbooru 标签 ↔ 中文)的纯逻辑部分:中文找英文、纠正写法、输入联想。
 * 数据是 dict/tags.json(scripts/tagDict/做标签库.py 生成,照搬自 my-app 的自然语言生图),
 * 读取见 load.ts;这里只管拿到数据以后怎么查,方便单测。
 *
 * 数据格式:{ v:1, tags: [[英文, 中文, 热度, 类别], ...按热度从高到低], alias: { 别名: 英文 } }
 * 类别:0 通用  1 画师  3 作品  4 角色  5 元数据
 */

/** [英文, 中文, 热度, 类别] */
export type TagEntry = [string, string, number, number];

export interface TagDictData {
  v?: number;
  tags: TagEntry[];
  alias?: Record<string, string>;
}

export interface TagFixResult {
  /** 纠正后的串;什么都没改时就是原串(不重排空格) */
  text: string;
  /** [原写法, 新写法] */
  changes: Array<[string, string]>;
}

export interface TagDict {
  size: number;
  /** 一个标签换成标签库里的写法;认不出返回 null */
  canon(tag: string): string | null;
  /** 纠正一串逗号分隔的标签:写法对照标签库,重复的去掉;带权重、括号、@ 之类的原样留着 */
  fix(text: string): TagFixResult;
  /** 中文正文里出现了哪些标签库认识的词,返回 [[中文, 英文], ...] */
  candidates(text: string, max?: number): Array<[string, string]>;
  /** 输入联想:英文按前缀 / 单词开头 / 包含,中文按开头 / 包含,热的在前 */
  suggest(query: string, max?: number): TagEntry[];
}

const CJK = /[一-鿿]/;
/** 这些写法不碰:权重、NAI 语法、画师前缀、@角色、转义括号、纯数字 */
const SPECIAL = /[:{}[\]()\\@|<>]/;

export const normTag = (s: string): string =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

export function createTagDict(data: TagDictData): TagDict {
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const alias = data?.alias ?? {};
  const byName = new Map<string, TagEntry>();
  for (const t of tags) if (!byName.has(t[0])) byName.set(t[0], t);

  let zhIndex: Map<string, TagEntry> | null = null;
  function buildZhIndex(): Map<string, TagEntry> {
    const index = new Map<string, TagEntry>();
    // 通用标签先进,同一个中文词通用的优先;角色、作品的中文名至少 3 个字,
    // 免得「黑色」这种两个字的译名把正文里的普通词认成角色(kuromi)
    for (const pass of [[0], [3, 4]]) {
      for (const t of tags) {
        // 画师、元数据不会出现在正文里
        if (!pass.includes(t[3]) || !t[1]) continue;
        const min = t[3] === 0 ? 2 : 3;
        for (let z of [t[1], t[1].replace(/[（(].*?[）)]/g, '')]) {
          z = z.trim();
          if (z.length < min || z.length > 12 || !CJK.test(z)) continue;
          if (!index.has(z)) index.set(z, t); // tags 按热度排好了,先到的最热
        }
      }
    }
    return index;
  }

  function canon(tag: string): string | null {
    const k = normTag(tag);
    if (!k) return null;
    if (byName.has(k)) return k;
    const a = alias[k];
    if (a && byName.has(a)) return a;
    const tries = [
      `${k}s`,
      k.replace(/s$/, ''),
      k.replace(/es$/, ''),
      k.replace(/-/g, ' '),
      k.replace(/ /g, '-'),
      k.replace(/colour/g, 'color'),
      k.replace(/grey/g, 'gray'),
      k.replace(/gray/g, 'grey'),
    ];
    for (const x of tries) if (x !== k && byName.has(x)) return x;
    return null;
  }

  function fix(text: string): TagFixResult {
    const source = String(text ?? '');
    const out: string[] = [];
    const seen = new Set<string>();
    const changes: Array<[string, string]> = [];
    let dropped = false;
    for (const raw of source.split(/[,，\n]/)) {
      const t = raw.trim();
      if (!t) continue;
      if (SPECIAL.test(t) || /^\d*\.?\d+$/.test(t)) {
        if (seen.has(t)) dropped = true;
        else {
          seen.add(t);
          out.push(t);
        }
        continue;
      }
      const c = canon(t);
      const v = c ?? t;
      const key = normTag(v);
      if (seen.has(key)) {
        dropped = true;
        continue;
      }
      seen.add(key);
      if (c && c !== t) changes.push([t, c]);
      out.push(v);
    }
    if (!changes.length && !dropped) return { text: source, changes };
    return { text: out.join(', '), changes };
  }

  function candidates(text: string, max = 40): Array<[string, string]> {
    if (!zhIndex) zhIndex = buildZhIndex();
    const s = String(text || '');
    const found: Array<[string, string]> = [];
    const used = new Set<string>();
    for (let i = 0; i < s.length && found.length < max; ) {
      let hit = 0;
      // 最长匹配:从 12 个字往下试
      for (let L = Math.min(12, s.length - i); L >= 2; L--) {
        const word = s.substr(i, L);
        const t = zhIndex.get(word);
        if (t) {
          if (!used.has(t[0])) {
            used.add(t[0]);
            found.push([word, t[0]]);
          }
          hit = L;
          break;
        }
      }
      i += hit || 1;
    }
    return found;
  }

  function suggest(query: string, max = 12): TagEntry[] {
    const raw = String(query || '').trim();
    const k = normTag(raw);
    if (!k) return [];
    const zh = CJK.test(raw);
    const a: TagEntry[] = [];
    const b: TagEntry[] = [];
    const c: TagEntry[] = [];
    const seen = new Set<string>();
    const push = (arr: TagEntry[], t: TagEntry): void => {
      if (!seen.has(t[0])) {
        seen.add(t[0]);
        arr.push(t);
      }
    };
    const al = !zh && alias[k] ? byName.get(alias[k]) : undefined;
    if (al) push(a, al);
    for (const t of tags) {
      if (zh) {
        if (!t[1]) continue;
        if (t[1].startsWith(raw)) push(a, t);
        else if (c.length < max && t[1].includes(raw)) push(c, t);
      } else if (t[0].startsWith(k)) push(a, t);
      else if (b.length < max && t[0].includes(` ${k}`)) push(b, t);
      else if (c.length < max && k.length >= 3 && t[0].includes(k)) push(c, t);
      if (a.length >= max) break;
    }
    return a.concat(b, c).slice(0, max);
  }

  return { size: tags.length, canon, fix, candidates, suggest };
}

/** 中英对照参考,附给写 tag 的 AI;没有认识的词返回空串 */
export function hintText(pairs: Array<[string, string]>): string {
  if (!pairs.length) return '';
  return `【标签库参考】正文里这些词在 Danbooru 标签库里的标准写法如下（中文=英文 tag），画面里用到时照这个写，用不到的不必写：\n${pairs
    .map(([zh, en]) => `${zh}=${en}`)
    .join('，')}`;
}

export const CAT_NAME: Record<number, string> = { 0: '通用', 1: '画师', 3: '作品', 4: '角色', 5: '元数据' };

export function fmtCount(n: number): string {
  if (n >= 1e4) return `${n >= 1e5 ? Math.round(n / 1e4) : (n / 1e4).toFixed(1)}万`;
  return String(n);
}
