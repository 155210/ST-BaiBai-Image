import type { CharTagEntry, CharTagField } from '@/state/charTags';

/**
 * 「胸部」一栏(本 fork 新增)的旧数据迁移:以前胸部大小写在「体型」里,
 * 读出来时把体型里的胸部词挪到「胸部」。拼出来的 tag 内容不变(胸部本来就紧跟在体型后面)。
 * 「胸部」已经填了的,体型里重复的胸部词去掉,以「胸部」为准,免得一张图里出现两种大小。
 */

const BUST_TAG = /^(?:flat chest|(?:small|medium|large|huge|gigantic) breasts)$/i;

export function splitBust(fields: Record<CharTagField, string>): Record<CharTagField, string> {
  const parts = (fields.body ?? '').split(',').map(part => part.trim()).filter(Boolean);
  const bust = parts.filter(part => BUST_TAG.test(part));
  if (!bust.length) return fields;
  const body = parts.filter(part => !BUST_TAG.test(part)).join(', ');
  return { ...fields, body, bust: (fields.bust ?? '').trim() || bust.join(', ') };
}

/** 整条:没变就原样返回。 */
export function withSplitBust(entry: CharTagEntry): CharTagEntry {
  const fields = splitBust(entry.fields);
  return fields === entry.fields ? entry : { ...entry, fields };
}
