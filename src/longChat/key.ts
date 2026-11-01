import { isCurrentChatExcluded } from '@/state/settings';
import { getContext } from '@/st/context';

/** 变了就得全量对账的状态:聊天、楼数、排除名单。 */
export function flushKey(): string {
  const ctx = getContext();
  return `${ctx?.getCurrentChatId?.() ?? ''}|${ctx?.chat?.length ?? 0}|${isCurrentChatExcluded() ? 1 : 0}`;
}
