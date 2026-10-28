import type { ImageCharacterPrompt } from '@/autoTag/protocol';

/**
 * NAI「生成自然语言」开关同时管「发不发」(本 fork 独有)。
 *
 * 原作者的开关只管自动 tag 写不写 nl,tag 里已有的 nl 照常发给 NAI,想看关掉的效果得重写提示词。
 * 这里在出图那一步跳过:开关关着就不发 tag 里的 nl(画面的和每个角色的)。
 * 正文里的 tag 不动——promptHash 吃 tag 原文,改了已有的图会全变成「旧提示词」。
 */
export function nlForSend<T extends { nl: string; characters: ImageCharacterPrompt[] }>(on: boolean, input: T): T {
  if (on) return input;
  return { ...input, nl: '', characters: input.characters.map(character => ({ ...character, nl: '' })) };
}
