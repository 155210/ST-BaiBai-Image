import type { ChatMsg } from '@/api/client';
import type { ImagePlan } from '@/autoTag/protocol';
import { hintText, type TagDict } from '@/tagDict/dict';
import { loadTagDict } from '@/tagDict/load';
import type { TagDictSettings } from '@/tagDict/settings';

/**
 * 标签库接进自动写 tag(runner.ts 里两处接入点):
 *  1. 写 tag 前:正文里出现的标签库中文词,把「中文=英文」附在发给 AI 的最后一条 user 消息末尾
 *  2. AI 写完后:每张图的 tag / 负面 / 角色 tag、角色库变化的外貌字段,对照标签库纠正写法
 * 标签库读不到或开关关着时原样返回,不影响写 tag。
 */

/** 正文中文词的参考段;没开、读不到或没有认识的词返回空串 */
export async function tagHintFor(options: TagDictSettings | undefined, text: string): Promise<string> {
  if (!options?.hint) return '';
  const dict = await loadTagDict();
  if (!dict) return '';
  return hintText(dict.candidates(text, 40));
}

/** 把参考段接到最后一条 user 消息后面(原数组不动,返回新数组) */
export function withTagHint(messages: ChatMsg[], hint: string): ChatMsg[] {
  if (!hint) return messages;
  const index = messages.map(m => m.role).lastIndexOf('user');
  if (index < 0) return [...messages, { role: 'user', content: hint }];
  return messages.map((m, i) => (i === index ? { ...m, content: `${m.content}\n\n${hint}` } : m));
}

/** 不按 tag 串处理的角色库字段 */
const PLAIN_FIELDS = new Set(['nl']);

/** 就地纠正一份写 tag 结果,返回所有改动 [原写法, 新写法] */
export function fixPlanTags(dict: TagDict, plan: ImagePlan): Array<[string, string]> {
  const all: Array<[string, string]> = [];
  const run = (text: string): string => {
    if (!text) return text;
    const r = dict.fix(text);
    all.push(...r.changes);
    return r.text;
  };
  for (const image of plan.images) {
    image.tag = run(image.tag);
    image.negative = run(image.negative);
    for (const character of image.characters) character.tag = run(character.tag);
  }
  for (const change of plan.changes) {
    if (PLAIN_FIELDS.has(change.field)) continue;
    if (change.field === 'new') {
      // 建档的值是各字段的 JSON
      try {
        const fields = JSON.parse(change.value) as Record<string, unknown>;
        for (const key of Object.keys(fields)) {
          if (typeof fields[key] === 'string') fields[key] = run(fields[key] as string);
        }
        change.value = JSON.stringify(fields);
      } catch {
        // 不是 JSON 就不动
      }
      continue;
    }
    change.value = run(change.value);
  }
  return all;
}

/** runner 用:开着就纠正并提示一下改了哪些 */
export async function fixPlanWithDict(
  options: TagDictSettings | undefined,
  plan: ImagePlan,
  quiet = false,
): Promise<void> {
  if (!options?.fix) return;
  const dict = await loadTagDict();
  if (!dict) return;
  const changes = fixPlanTags(dict, plan);
  if (!changes.length || quiet) return;
  const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const shown = changes.slice(0, 6).map(([a, b]) => esc(`${a} → ${b}`)).join('<br>');
  toastr.info(`${shown}${changes.length > 6 ? '<br>…' : ''}`, `柏宝绘：标签库纠正了 ${changes.length} 个写法`);
}
