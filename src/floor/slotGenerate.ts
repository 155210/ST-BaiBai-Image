import type { ImageCharacterPrompt } from '@/autoTag/protocol';
import type { Orientation } from '@/backends/size';
import { decideSeed, generateImage } from '@/generate';
import {
  beginGen,
  clearGen,
  failGen,
  isCurrentGen,
  setGenPhase,
  setGenRetry,
  setQueueAhead,
  slotKey,
} from '@/floor/genState';
import { hydrateMessage } from '@/floor/hydrate';
import { promptHash, saveImageResult } from '@/floor/storage';
import { activeComfyPreset, settings } from '@/state/settings';
import { beginImage, failImage, finishImage, safeHistory } from '@/state/history';
import { getContext } from '@/st/context';
import { nlForSlot } from '@/nlSwitch/perSlot';

/**
 * 给一个槽位出一张图并落盘:楼层卡片的「生成图片」和批量出图共用这一条路。
 *
 * 不依赖卡片组件:运行态写 genState(卡片若正挂着,会按 key 认领显示进度),
 * 结果写进本楼 extra,成功后重水合本楼。卡片不在页面上时照样能跑。
 */

export interface SlotJob {
  chatId: string;
  messageId: number;
  swipeId: number;
  seq: number;
  /** tag 原文(含 <bbi_image> 壳):promptHash 与落盘的输入。 */
  tag: string;
  prompt: string;
  nl: string;
  negative: string;
  characters: ImageCharacterPrompt[];
  /** 实际出图方向(已按渠道锁算好)。 */
  size: Orientation;
}

export type SlotResult = { kind: 'saved' } | { kind: 'superseded' | 'aborted' } | { kind: 'failed'; error: string };

export async function generateSlot(original: SlotJob): Promise<SlotResult> {
  // 这张勾了「不发自然语言」就只发 tag(nlSwitch/perSlot.ts)
  const job = nlForSlot(original);
  const slot = slotKey(job.chatId, job.messageId, job.swipeId, job.seq);
  const naiActive = settings.defaultBackend === 'nai';
  // NAI 需要闸门排队 → 先显示「排队中」;ComfyUI 有服务端队列,直接进 generating
  const { signal, token } = beginGen(slot, promptHash(job.tag), naiActive ? 'queued' : 'generating');
  // 历史记录 id:在 seed 确定后才登记(见下),故这里先置空,catch 里据此判断要不要收尾。
  let historyId: number | null = null;

  try {
    // 发起时就确定种子(NAI 面板种子 > 0 时用固定值;否则随机),随结果落盘进 extra
    // (entry.seed),历史翻页可查/可复用。口径在 generate.ts,与公开接口同源。
    const seed = decideSeed(settings.defaultBackend);
    // 历史埋点:seed 已定、请求将发,此刻登记。图片本身不进 store(dataURL 会爆内存,
    // 且图随后就落盘进 ST 了)——只留元信息 + 楼层坐标,够回溯「这张图是怎么来的」。
    historyId = safeHistory(() =>
      beginImage({
        backend: naiActive ? 'nai' : 'comfyui',
        model: naiActive ? settings.nai.model : activeComfyPreset().name,
        prompt: job.prompt,
        nl: job.nl,
        negative: job.negative,
        characters: job.characters,
        seed,
        size: job.size,
        floor: job.messageId,
        seq: job.seq,
      }),
    );
    // 闸门、后端分派都在 generateImage 里(公开接口走同一条路,见 generate.ts);
    // 这里只把进度回调接到槽位运行态上。
    const { result, meta } = await generateImage({ ...job, seed }, signal, {
      onStart: () => setGenPhase(slot, token, 'generating'),
      onQueue: ahead => setQueueAhead(slot, token, ahead),
      onRetry: retry => setGenRetry(slot, token, retry),
    });
    // 图已经拿到手:此时若发现本任务已被取代(取消后重绘 / reconcile / 切聊天),不要落盘,
    // 否则会把旧提示词的结果写进 extra,并触发一次多余的重水合打断新任务。
    if (!isCurrentGen(slot, token)) {
      result.revoke();
      // 图出来了却被丢弃,历史里记成「已取消」——否则这条会永远停在「进行中」。
      if (historyId !== null) safeHistory(() => failImage(historyId!, '', true));
      return { kind: 'superseded' };
    }
    // 落盘:图片进 ST 文件系统 + extra 写指针。成功后重水合,
    // 卡片从 extra 恢复为 ready(blob/dataURL 生命周期随之结束)。
    await saveImageResult(job.messageId, job.swipeId, job.seq, job.tag, seed, result, meta);
    result.revoke();
    if (historyId !== null) safeHistory(() => finishImage(historyId!));
    // 先清运行态再重水合:重水合会重建卡片,清完才不会带着 generating 复活
    clearGen(slot, token);
    const ctx = getContext();
    if (ctx) hydrateMessage(job.messageId, ctx);
    return { kind: 'saved' };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    const message = e instanceof Error ? e.message : String(e);
    if (historyId !== null) {
      safeHistory(() => failImage(historyId!, message, aborted));
    }
    if (aborted) {
      clearGen(slot, token);
      return { kind: 'aborted' };
    }
    failGen(slot, token, message);
    return { kind: 'failed', error: message };
  }
}
