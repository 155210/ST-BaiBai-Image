import { requestFloorTags, requestRegenTags } from '@/autoTag/runner';
import { chooseRegen } from '@/rewriteHint/floorPassageGen';
import { settings } from '@/state/settings';
import { getContext, isAiStoryMessage } from '@/st/context';
import { hasImageTagTrace, parseImageTags } from '@/st/imageTagRegex';

/**
 * fork:按楼号做楼层「🎧」里那几件事,不用把那一楼显示在页面上(批量页「单楼操作」)。
 * 和楼层按钮(floor/actionButton.ts)同一套判断:已有 tag 就是重新生成,先弹选择框。
 */

export interface FloorInfo {
  ok: boolean;
  /** ok 为 false 时的原因。 */
  reason: string;
  hasTags: boolean;
  images: number;
}

export function floorInfo(floor: number): FloorInfo {
  const chat = getContext()?.chat ?? [];
  if (!Number.isInteger(floor) || floor < 0 || floor >= chat.length) {
    return { ok: false, reason: chat.length ? `楼号要在 0–${chat.length - 1} 之间` : '还没打开聊天', hasTags: false, images: 0 };
  }
  const message = chat[floor];
  if (!isAiStoryMessage(message)) return { ok: false, reason: '这一楼不是 AI 的剧情楼', hasTags: false, images: 0 };
  const mes = message.mes ?? '';
  return { ok: true, reason: '', hasTags: hasImageTagTrace(mes), images: parseImageTags(mes).length };
}

const running = new Set<number>();

export function isTagRunning(floor: number): boolean {
  return running.has(floor);
}

/** 写 / 重新生成这一楼的生图 tag。返回 false 表示没开始(取消、楼不对、正在跑)。 */
export async function runFloorTag(floor: number): Promise<boolean> {
  const info = floorInfo(floor);
  if (!info.ok) {
    toastr.warning(info.reason, '柏宝绘');
    return false;
  }
  if (!settings.enabled) {
    toastr.warning('柏宝绘已停用，请先在插件设置里开启', '柏宝绘');
    return false;
  }
  if (running.has(floor)) return false;
  const regen = info.hasTags ? await chooseRegen(floor) : null;
  if (info.hasTags && !regen) return false;
  running.add(floor);
  try {
    await (regen ? requestRegenTags(floor, regen) : requestFloorTags(floor, { replace: info.hasTags }));
  } finally {
    running.delete(floor);
  }
  return true;
}
