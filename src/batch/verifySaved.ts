import { BBI_CHAR_EXTRA_KEY } from '@/state/charTags';
import { getContext, type STContext, type STMessage } from '@/st/context';

/**
 * 收尾核对:批量写过的楼,服务器上的聊天文件是不是和内存里一致。
 *
 * 为什么要核对:ST 的 saveChat 在上一次保存还没完成时只等 1 秒,等不到就**静默放弃**
 * 这次保存(只打一条 console.warn)。聊天很大时一次保存就要好几秒,和 ST 自己的
 * 自动保存撞上就会漏存。好在每次保存都是整份聊天,所以只要最后一次存成功,
 * 前面漏的也就补上了——收尾时存一次、读回来比一遍即可,不用每楼都下载整个聊天。
 */

/** 参与比对的内容:正文(tag 写在这里)和本楼的角色档案增量。 */
function signature(message: STMessage | undefined): string {
  return JSON.stringify([message?.mes ?? null, message?.extra?.[BBI_CHAR_EXTRA_KEY] ?? null]);
}

export function unsavedFloors(memory: STMessage[], saved: STMessage[], floors: number[]): number[] {
  return floors.filter(floor => memory[floor] && signature(memory[floor]) !== signature(saved[floor]));
}

async function fetchSavedChat(context: STContext): Promise<STMessage[]> {
  const headers = context.getRequestHeaders();
  let response: Response;
  if (context.groupId) {
    response = await fetch('/api/chats/group/get', {
      method: 'POST',
      headers,
      cache: 'no-cache',
      body: JSON.stringify({ id: context.getCurrentChatId() }),
    });
  } else {
    const character = context.characterId === undefined ? undefined : context.characters?.[Number(context.characterId)];
    const fileName = (character as { chat?: string } | undefined)?.chat;
    if (!character || !fileName) throw new Error('找不到当前角色的聊天文件');
    response = await fetch('/api/chats/get', {
      method: 'POST',
      headers,
      cache: 'no-cache',
      body: JSON.stringify({ ch_name: character.name, file_name: fileName, avatar_url: character.avatar }),
    });
  }
  if (!response.ok) throw new Error(`读取服务器上的聊天失败（HTTP ${response.status}）`);
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) throw new Error('服务器返回的聊天格式不对');
  // 文件第一行是聊天头(带 chat_metadata),不是消息
  const first = data[0] as Record<string, unknown> | undefined;
  if (first && typeof first === 'object' && 'chat_metadata' in first) data.shift();
  return data as STMessage[];
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; floors: number[]; error?: undefined }
  | { ok: false; floors: number[]; error: string };

/**
 * 保存并核对,最多补存 attempts 次。只核对 floors 里的楼。
 * 读不到服务器文件时返回 error(不代表没存上,只是没法确认)。
 */
export async function saveAndVerify(
  chatId: string,
  floors: number[],
  attempts = 3,
): Promise<VerifyResult> {
  if (!floors.length) return { ok: true };
  let bad: number[] = floors;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const context = getContext();
    if (!context || context.getCurrentChatId() !== chatId) {
      return { ok: false, floors: bad, error: '已切换聊天，没法核对' };
    }
    // 先让 ST 自己可能在途的保存走完,再主动存一次
    await new Promise(resolve => setTimeout(resolve, 1500));
    try {
      await context.saveChat();
    } catch (error) {
      console.warn('[柏宝绘] 批量收尾保存出错', error);
    }
    let saved: STMessage[];
    try {
      saved = await fetchSavedChat(context);
    } catch (error) {
      return { ok: false, floors: [], error: error instanceof Error ? error.message : String(error) };
    }
    bad = unsavedFloors(context.chat, saved, floors);
    if (!bad.length) return { ok: true };
    console.warn(`[柏宝绘] 批量核对:${bad.length} 楼还没存到服务器,第 ${attempt + 1} 次补存`, bad.slice(0, 20));
  }
  return { ok: false, floors: bad };
}
