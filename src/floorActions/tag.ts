import { reactive } from 'vue';
import { requestFloorTags, requestRegenTags } from '@/autoTag/runner';
import { imagesReady, needsImage } from '@/batch/controller';
import { runImageFloor } from '@/batch/imageFloor';
import { consumeAutoGenerate } from '@/floor/autoGenerate';
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

/** 正在写 tag 的楼(响应式:界面按楼号显示「正在写」,别的楼照样能点)。 */
const running = reactive(new Set<number>());

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
    const outcome = await (regen ? requestRegenTags(floor, regen) : requestFloorTags(floor, { replace: info.hasTags }));
    if (outcome.kind === 'written') await imagesAfterTag(floor);
  } finally {
    running.delete(floor);
  }
  return true;
}

/** 批量页「写完 tag 接着出图」的勾(BatchSection.vue 存的同一个键)。 */
export function thenImagesChecked(): boolean {
  try {
    return localStorage.getItem('bbi_batch_tag_then_image') === '1';
  } catch {
    return false;
  }
}

/**
 * 取走这一楼(当前 swipe)还挂着的出图标记,返回其中「一定要出」(force)的那几张的序号。
 * 楼没显示在聊天里时没有卡片来认领标记:留着它,用户日后翻到这一楼会突然再出一遍。
 */
function takeMarks(floor: number): number[] {
  const context = getContext();
  const chatId = context?.getCurrentChatId?.() ?? '';
  const message = context?.chat?.[floor];
  if (!chatId || !message) return [];
  const forced: number[] = [];
  parseImageTags(message.mes ?? '').forEach((_tag, seq) => {
    if (consumeAutoGenerate(chatId, floor, message.swipe_id ?? 0, seq) === 'force') forced.push(seq);
  });
  return forced;
}

/**
 * 单楼操作写完 tag 之后的出图。
 *
 * 这一楼正显示在聊天里:卡片自己会按出图标记出(挑段落 / 一起改一定出,普通写 tag 看
 * 「写入 tag 后自动生成」),这里只在勾了「写完 tag 接着出图」时把卡片不会出的补上。
 * 没显示在聊天里(单楼操作多半如此):没有卡片,挑段落 / 一起改的那几张在这里直接出,
 * 勾了「写完 tag 接着出图」就把这一楼没出的都出掉;出图标记一并取走,免得以后翻到这楼重复出。
 */
export async function imagesAfterTag(floor: number): Promise<void> {
  const shown = !!document.querySelector(`#chat .mes[mesid="${floor}"]`);
  const forced = shown ? [] : takeMarks(floor);
  const all = thenImagesChecked() && !(shown && settings.autoTag.autoGenerate);
  if (!all && !forced.length) return;
  if (!imagesReady()) {
    if (forced.length) toastr.warning('提示词写好了，但出图渠道还没配好，没有出图', '柏宝绘');
    return;
  }
  if (!needsImage(floor)) return;
  const result = await runImageFloor(floor, new AbortController().signal, 'all', all ? undefined : forced);
  if (result.kind === 'failed') toastr.warning(`第 ${floor} 楼出图失败：${result.reason ?? '没有出图'}`, '柏宝绘');
  else if (result.kind === 'written') toastr.success(`第 ${floor} 楼的图出好了`, '柏宝绘');
}
