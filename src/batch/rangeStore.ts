import { reactive, watch } from 'vue';

import { getContext } from '@/st/context';

/**
 * 批量页三个标签(批量生成 / 图片浏览 / 角色搜索)共用的楼层范围与「每 N 个 AI 楼」。
 * 只记在浏览器本地(方便下次打开),不进插件设置。
 */

const RANGE_KEY = 'bbi_batch_range';
/** 0.3.2.2~0.3.2.3 时写 tag 与出图各有一个范围;没有新记录时沿用写 tag 的那个。 */
const LEGACY_RANGE_KEY = 'bbi_batch_tag_range';
const STEP_KEY = 'bbi_batch_step';

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

/** 「从这楼起设为范围」:从 floor 到最后一楼。 */
export function setRangeFrom(floor: number): string {
  const last = (getContext()?.chat?.length ?? 1) - 1;
  batchRange.text = `${floor}-${Math.max(floor, last)}`;
  return batchRange.text;
}
