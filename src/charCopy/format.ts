import { CHAR_TAG_FIELDS, CHAR_TAG_FIELD_LABELS, charFieldsEmpty, type CharTagField } from '@/state/charTags';

/**
 * 角色外貌「复制出去 / 粘贴回来」(本 fork 独有)。
 *
 * 复制:每栏一行「【栏目】内容」,前面一句给识图 AI 的说明。
 * 粘贴:AI 改完常会改格式(加粗、列表、表格、换成冒号、加代码块、写「原来 → 现在」),
 * 这里尽量都认出来;没写到的栏不动,写了「无」的栏清空。
 */

export type CharCopyKey = CharTagField | 'raw' | 'nl';

export interface CharCopySource {
  name: string;
  fields: Record<CharTagField, string>;
  raw: string;
  nl: string;
}

export interface CharPasteResult {
  /** 认出来的栏目及内容(空串 = 清空);没出现的栏目不在里面 */
  values: Partial<Record<CharCopyKey, string>>;
  /** 粘贴里写的角色名(只做提示,不改名) */
  name?: string;
}

const RAW_LABEL = '整串 tag';
const NL_LABEL = '自然语言外貌';
const NAME_LABEL = '角色';

const INSTRUCTION =
  '请对照图片检查下面这个角色的外貌，把不对的改掉、缺的补上。' +
  '回复时保持每行「【栏目】内容」的格式，栏目名不要改；tag 栏写英文 Danbooru tag、用英文逗号分隔，没有就写「无」；' +
  '自然语言外貌写一段连贯的英文；直接写改好的结果，不要写「原来 → 现在」，也不要加别的说明。';

function labelOf(key: CharCopyKey): string {
  if (key === 'raw') return RAW_LABEL;
  if (key === 'nl') return NL_LABEL;
  return CHAR_TAG_FIELD_LABELS[key];
}

export function formatCharForCopy(source: CharCopySource): string {
  const lines = [INSTRUCTION, '', `【${NAME_LABEL}】${source.name.trim()}`];
  // 整串模式(只有整串、字段全空)才带整串;平时只给字段,免得 AI 两边都改、对不上
  const rawMode = !!source.raw.trim() && charFieldsEmpty(source.fields);
  const keys: CharCopyKey[] = rawMode ? ['raw', 'nl'] : [...CHAR_TAG_FIELDS, 'nl'];
  for (const key of keys) {
    const value = key === 'raw' ? source.raw : key === 'nl' ? source.nl : source.fields[key];
    lines.push(`【${labelOf(key)}】${value.trim() || '无'}`);
  }
  return lines.join('\n');
}

/* —— 解析 —— */

/** 栏目名别名,比较前统一去空格、小写、去掉「tag」字样 */
const ALIASES: Record<CharCopyKey | 'name', string[]> = {
  name: ['角色', '角色名', '名字', '姓名', 'name', 'character'],
  fandom: ['同人身份', '同人', '同人身份标签', '作品', 'fandom', 'copyright'],
  sex: ['性别', 'sex', 'gender'],
  hair: ['头发', '发型', '发色', '发型发色', 'hair'],
  eyes: ['眼睛', '眼', '眼睛颜色', '瞳色', '瞳孔', 'eyes', 'eye'],
  skin: ['肤色', '皮肤', 'skin'],
  body: ['体型', '身材', '体形', 'body'],
  bust: ['胸部', '胸', '罩杯', '胸部大小', 'bust', 'breasts', 'chest'],
  extra: ['标志特征', '特征', '其他特征', '特殊特征', 'extra', 'features'],
  outfit: ['固定着装', '着装', '服装', '衣着', '穿着', 'outfit', 'clothes', 'clothing'],
  raw: ['整串', '整串标签', 'raw'],
  nl: ['自然语言外貌', '自然语言', '自然语言描述', '外貌描述', '外貌', 'nl', 'naturallanguage', 'description'],
};

function normLabel(label: string): string {
  return label
    .replace(/[\s*_`'"“”‘’]/g, '')
    .toLowerCase()
    .replace(/tags?|标签/g, '')
    .replace(/[（(].*?[）)]$/, '');
}

const LABEL_LOOKUP = new Map<string, CharCopyKey | 'name'>();
for (const [key, names] of Object.entries(ALIASES) as [CharCopyKey | 'name', string[]][]) {
  for (const n of names) LABEL_LOOKUP.set(normLabel(n), key);
}
// 现在界面上的栏目名也认(以后改名了复制出去的仍能贴回来)
for (const f of CHAR_TAG_FIELDS) LABEL_LOOKUP.set(normLabel(CHAR_TAG_FIELD_LABELS[f]), f);

function lookupLabel(label: string): CharCopyKey | 'name' | undefined {
  const n = normLabel(label);
  return n ? LABEL_LOOKUP.get(n) : undefined;
}

const EMPTY_VALUE = /^(?:无|没有|空|留空|不填|暂无|无需|none|null|n\/?a|nil|empty|-+|—+|\/)$/i;

interface LabeledLine {
  /** undefined = 带了栏目格式但不是我们的栏目(如「修改说明」),到此为止 */
  key: CharCopyKey | 'name' | undefined;
  value: string;
}

/** 认一行是不是「栏目:内容」;不是就返回 null(当上一栏的续行) */
function matchLabeled(line: string): LabeledLine | null {
  // 去掉列表符号、标题井号、引用号
  const s = line.replace(/^\s*(?:[-*+•·>]+|#+|\d+[.)、])\s*/, '').trim();
  if (!s) return null;

  // 表格行:| 栏目 | 内容 |
  if (s.startsWith('|')) {
    const cells = s.split('|').map(c => c.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 2 || cells.every(c => /^:?-+:?$/.test(c))) return { key: undefined, value: '' };
    const key = lookupLabel(cells[0]!);
    return key ? { key, value: cells.slice(1).join(', ') } : { key: undefined, value: '' };
  }

  // 括号栏目:【栏目】内容 / [栏目] 内容 / 「栏目」:内容
  const bracket = /^\*{0,2}[【\[［「〔]([^】\]］」〕]{1,20})[】\]］」〕]\*{0,2}\s*[:：]?\s*(.*)$/.exec(s);
  if (bracket) return { key: lookupLabel(bracket[1]!), value: bracket[2]! };

  // 加粗栏目:**栏目**:内容 / **栏目:** 内容
  const bold = /^\*\*([^*]{1,20}?)\s*[:：]?\s*\*\*\s*[:：]?\s*(.*)$/.exec(s);
  if (bold) return { key: lookupLabel(bold[1]!), value: bold[2]! };

  // 光栏目:栏目:内容 —— 只认已知栏目,免得把英文描述里的「Note: ...」当栏目
  const bare = /^([^:：]{1,20}?)\s*[:：]\s*(.*)$/.exec(s);
  if (bare) {
    const key = lookupLabel(bare[1]!);
    if (key) return { key, value: bare[2]! };
  }
  return null;
}

function cleanPiece(value: string): string {
  let v = value.trim();
  // 「原来 → 现在」只要现在
  const arrow = v.split(/\s*(?:→|->|=>|⟶)\s*/);
  if (arrow.length > 1) v = arrow[arrow.length - 1]!;
  return v
    .replace(/^\*+|\*+$/g, '')
    .replace(/^`+|`+$/g, '')
    .replace(/^["“'‘]|["”'’]$/g, '')
    .trim();
}

function finishTags(parts: string[]): string {
  const tags = parts
    .join(',')
    .split(/[,，、;；\n]/)
    .map(t => cleanPiece(t).replace(/[。.]+$/, '').trim())
    .filter(Boolean);
  if (tags.length === 1 && EMPTY_VALUE.test(tags[0]!)) return '';
  return tags.filter(t => !EMPTY_VALUE.test(t)).join(', ');
}

function finishText(parts: string[]): string {
  const text = parts.map(cleanPiece).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return EMPTY_VALUE.test(text) ? '' : text;
}

export function parseCharPaste(text: string): CharPasteResult {
  const result: CharPasteResult = { values: {} };
  let current: CharCopyKey | 'name' | undefined;
  let parts: string[] = [];

  const flush = () => {
    if (current === 'name') {
      const name = finishText(parts);
      if (name) result.name = name;
    } else if (current) {
      result.values[current] = current === 'nl' ? finishText(parts) : finishTags(parts);
    }
    current = undefined;
    parts = [];
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) continue;
    if (!line.trim()) {
      // 空行收尾:AI 在最后补的一段说明不会混进自然语言外貌
      flush();
      continue;
    }
    const labeled = matchLabeled(line);
    if (labeled) {
      flush();
      current = labeled.key;
      if (current) parts.push(labeled.value);
      continue;
    }
    if (current) parts.push(line);
  }
  flush();
  return result;
}

export function pasteKeyLabel(key: CharCopyKey): string {
  return labelOf(key);
}
