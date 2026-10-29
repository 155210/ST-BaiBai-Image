/**
 * 单个 tag 的权重加减(提示词框下面的「− 1.3 +」)。
 * 两种写法:NAI 的 `1.3::tag::`,SD / ComfyUI 的 `(tag:1.3)`。已有权重的 tag 按它原来的写法改,
 * 没有权重的按当前出图渠道选写法;调回 1 就把权重写法去掉。
 */
export type WeightStyle = 'nai' | 'sd';

export interface WeightedTag {
  tag: string;
  weight: number;
  /** 原来是哪种写法;没写权重是 null */
  style: WeightStyle | null;
}

const NAI = /^(-?\d*\.?\d+)::(.+?)::$/;
const SD = /^\(([^():]+):(-?\d*\.?\d+)\)$/;

export const WEIGHT_MIN = 0.1;
export const WEIGHT_MAX = 3;

export function parseWeight(token: string): WeightedTag {
  const t = token.trim();
  let m = NAI.exec(t);
  if (m) return { tag: m[2].trim(), weight: Number(m[1]), style: 'nai' };
  m = SD.exec(t);
  if (m) return { tag: m[1].trim(), weight: Number(m[2]), style: 'sd' };
  return { tag: t, weight: 1, style: null };
}

const round = (n: number): number => Math.round(n * 10) / 10;

export function formatWeight(tag: string, weight: number, style: WeightStyle): string {
  const w = round(weight);
  if (w === 1) return tag;
  return style === 'nai' ? `${w}::${tag}::` : `(${tag}:${w})`;
}

/** 权重加减 delta 之后的写法;tag 为空或含别的语法(逗号分组、括号嵌套)时返回 null */
export function stepWeight(token: string, delta: number, fallback: WeightStyle): string | null {
  const p = parseWeight(token);
  if (!p.tag || (!p.style && /[{}[\]()|<>]/.test(p.tag))) return null;
  const style = p.style ?? fallback;
  // NAI 的 artist:xxx 可以加权重;SD 写法里冒号会被当成权重,不碰
  if (!p.style && p.tag.includes(':') && (style !== 'nai' || p.tag.includes('::'))) return null;
  const next = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, round(p.weight + delta)));
  return formatWeight(p.tag, next, style);
}
