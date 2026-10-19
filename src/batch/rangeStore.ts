import { reactive, watch } from 'vue';

import { getContext } from '@/st/context';

/**
 * 批量页的楼层范围与「每 N 个 AI 楼」。「批量生成」和「图片浏览」各有一个范围,
 * 批量跑着的时候照样能改图片浏览的范围;角色搜索总是搜整个聊天,不用范围。
 * 只记在浏览器本地(方便下次打开),不进插件设置。
 */

const RANGE_KEY = 'bbi_batch_range';
/** 0.3.2.2~0.3.2.3 时写 tag 与出图各有一个范围;没有新记录时沿用写 tag 的那个。 */
const LEGACY_RANGE_KEY = 'bbi_batch_tag_range';
const STEP_KEY = 'bbi_batch_step';
const GALLERY_RANGE_KEY = 'bbi_batch_gallery_range';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 记不住就算了 */
  }
}

export const batchRange = reactive({
  /** 留空 = 整个聊天。 */
  text: read(RANGE_KEY) ?? read(LEGACY_RANGE_KEY) ?? '',
  /** 每 N 个 AI 楼取一楼;1 = 每楼都要。 */
  step: Math.max(1, Number(read(STEP_KEY)) || 1),
});

watch(
  () => batchRange.text,
  value => write(RANGE_KEY, value),
);
watch(
  () => batchRange.step,
  value => write(STEP_KEY, String(value)),
);

/** 图片浏览自己的范围;第一次用时沿用批量生成的。 */
export const galleryRange = reactive({
  text: read(GALLERY_RANGE_KEY) ?? batchRange.text,
});

watch(
  () => galleryRange.text,
  value => write(GALLERY_RANGE_KEY, value),
);

/**
 * 「从这楼起设为范围」:从 floor 到最后一楼,批量生成和图片浏览都设上。
 * 批量正在跑时不动批量生成的范围(返回 batch: false)。
 */
export function setRangeFrom(floor: number, batchRunning: boolean): { text: string; batch: boolean } {
  const last = (getContext()?.chat?.length ?? 1) - 1;
  const text = `${floor}-${Math.max(floor, last)}`;
  galleryRange.text = text;
  if (!batchRunning) batchRange.text = text;
  return { text, batch: !batchRunning };
}
