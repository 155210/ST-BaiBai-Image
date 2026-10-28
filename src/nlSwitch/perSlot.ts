import { slotKey } from '@/floor/genState';

import { nlForSend } from './send';

/**
 * 单张图「出图不发自然语言」(本 fork 独有)。
 *
 * 渠道上的「生成自然语言」管全部;这里按张记:图片浏览大图的菜单、「一起改这层的图」里勾了的那几张,
 * 出图时只发 tag。正文里的 tag 不动(理由同 send.ts)。记在浏览器里,刷新后还在,最多记 300 张。
 */

const STORAGE_KEY = 'bbi-no-nl-slots';
const MAX = 300;

function load(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function store(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-MAX)));
  } catch {
    // 存不下就只在这次生效不了,不影响出图
  }
}

export interface SlotRef {
  chatId: string;
  messageId: number;
  swipeId: number;
  seq: number;
}

function keyOf(at: SlotRef): string {
  return slotKey(at.chatId, at.messageId, at.swipeId, at.seq);
}

export function slotNoNl(at: SlotRef): boolean {
  return load().includes(keyOf(at));
}

export function setSlotNoNl(at: SlotRef, on: boolean): void {
  const key = keyOf(at);
  const keys = load().filter(k => k !== key);
  if (on) keys.push(key);
  store(keys);
}

/** 出图前过一遍:这张勾了「不发自然语言」就把 nl 清掉再发。 */
export function nlForSlot<T extends SlotRef & { nl: string; characters: { name: string; tag: string; nl: string }[] }>(job: T): T {
  return slotNoNl(job) ? nlForSend(false, job) : job;
}
