/**
 * 重型自定义提示词:导入的酒馆(SillyTavern)聊天补全预设。
 *
 * 自动 tag 每楼先用默认提示词(prompt.ts 拼的那条消息链)请求;返回解析/校验不过时,
 * 剩下的重试次数改用这里的重型提示词——预设各条目按自己的身份(system/user/assistant)、
 * 位置(相对 / 聊天中深度)、顺序和开关拼装,默认提示词整条消息链放在「柏宝绘提示词」
 * 这个条目上,相当于酒馆预设里「聊天记录」所在的位置(柏宝绘的正文就是这条链)。
 * 下一楼照常从默认提示词开始。重试次数为 0 时只发默认提示词,重型永远用不上。
 *
 * 本模块只做纯数据:类型、设置兜底、预设解析、消息拼装,不读 settings、不碰 ST,便于单测。
 */
import type { ChatMsg } from '@/api/client';

export type HeavyRole = ChatMsg['role'];

/** 柏宝绘默认提示词的占位条目 id;拼装时展开成整条默认消息链。 */
export const HEAVY_SLOT_ID = 'bbi-default-prompt';

export interface HeavyEntry {
  /** 预设里的 identifier(柏宝绘占位条目固定为 HEAVY_SLOT_ID)。 */
  id: string;
  name: string;
  role: HeavyRole;
  content: string;
  enabled: boolean;
  /** relative = 按列表顺序;depth = 插进默认提示词消息链里,倒数第 depth 条之前(0 = 最末尾)。 */
  position: 'relative' | 'depth';
  depth: number;
  /** 同一深度内的先后(与酒馆 injection_order 同义:小的在前)。 */
  order: number;
}

export interface HeavyPresetSettings {
  /** 解析失败时是否改用重型提示词重试。 */
  enabled: boolean;
  /** 导入时的预设名(仅展示)。 */
  name: string;
  /** 条目列表,顺序即相对条目的拼装顺序;总含且只含一个占位条目。 */
  entries: HeavyEntry[];
}

export function heavySlotEntry(): HeavyEntry {
  return {
    id: HEAVY_SLOT_ID,
    name: '柏宝绘提示词（默认自定义提示词）',
    role: 'system',
    content: '',
    enabled: true,
    position: 'relative',
    depth: 0,
    order: 100,
  };
}

export function heavyPresetDefaults(): HeavyPresetSettings {
  return { enabled: true, name: '', entries: [heavySlotEntry()] };
}

function normalizeRole(value: unknown): HeavyRole {
  return value === 'user' || value === 'assistant' ? value : 'system';
}

function finiteInt(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : fallback;
}

/** 设置兜底:逐字段补全;占位条目缺了补到末尾、重复的只留第一个,其余条目 id 去重。 */
export function normalizeHeavyPreset(raw: unknown): HeavyPresetSettings {
  const d = heavyPresetDefaults();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<HeavyPresetSettings>;
  const entries: HeavyEntry[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(r.entries) ? r.entries : []) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<HeavyEntry>;
    const id = typeof e.id === 'string' && e.id ? e.id : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (id === HEAVY_SLOT_ID) {
      entries.push(heavySlotEntry());
      continue;
    }
    entries.push({
      id,
      name: typeof e.name === 'string' ? e.name : id,
      role: normalizeRole(e.role),
      content: typeof e.content === 'string' ? e.content : '',
      enabled: typeof e.enabled === 'boolean' ? e.enabled : true,
      position: e.position === 'depth' ? 'depth' : 'relative',
      depth: finiteInt(e.depth, 4),
      order: finiteInt(e.order, 100, Number.MIN_SAFE_INTEGER),
    });
  }
  if (!seen.has(HEAVY_SLOT_ID)) entries.push(heavySlotEntry());
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    name: typeof r.name === 'string' ? r.name : d.name,
    entries,
  };
}

/** 是否有可用的重型提示词:开关开着,且除占位外至少有一条启用、非空的条目。 */
export function heavyPresetUsable(preset: HeavyPresetSettings | undefined | null): boolean {
  return !!preset?.enabled && preset.entries.some(e => e.id !== HEAVY_SLOT_ID && e.enabled && e.content.trim());
}

interface STPromptRaw {
  identifier?: unknown;
  name?: unknown;
  role?: unknown;
  content?: unknown;
  marker?: unknown;
  enabled?: unknown;
  injection_position?: unknown;
  injection_depth?: unknown;
  injection_order?: unknown;
  injection_trigger?: unknown;
}

interface STOrderItem {
  identifier?: unknown;
  enabled?: unknown;
}

/** 酒馆的聊天记录占位;柏宝绘的默认提示词放在它的位置上。 */
const CHAT_HISTORY_ID = 'chatHistory';

/** 从 prompt_order 里取一份顺序:优先全局默认(100001),再 100000,再条目最多的那份。 */
function pickOrder(rawOrder: unknown): STOrderItem[] | null {
  if (!Array.isArray(rawOrder) || !rawOrder.length) return null;
  // 提示词管理器单独导出的格式:prompt_order 直接就是 [{identifier, enabled}]
  if (rawOrder.every(x => x && typeof x === 'object' && 'identifier' in x)) return rawOrder as STOrderItem[];
  const lists = rawOrder.filter(
    (x): x is { character_id?: unknown; order: STOrderItem[] } =>
      !!x && typeof x === 'object' && Array.isArray((x as { order?: unknown }).order),
  );
  const byId = (id: number) => lists.find(x => Number(x.character_id) === id)?.order;
  return (
    byId(100001) ??
    byId(100000) ??
    lists.slice().sort((a, b) => b.order.length - a.order.length)[0]?.order ??
    null
  );
}

/**
 * 解析酒馆预设 JSON(整份聊天补全预设,或提示词管理器单独导出的 {data:{prompts,prompt_order}})。
 *
 * - 按 prompt_order 排序与取开关;不在 order 里的条目追加在末尾、默认关闭。
 * - 标记条目(角色卡、世界书、示例对话等,由酒馆现场填充)不导入:柏宝绘的默认提示词已自带
 *   角色卡/人设/世界书;聊天记录标记换成柏宝绘占位条目。没有聊天记录标记时占位放末尾。
 * - 触发器写明了、但不含「正常」的条目导入为关闭(酒馆普通生成时它也不发)。
 */
export function parseSTPreset(json: unknown): { entries: HeavyEntry[]; promptCount: number } {
  const root = (json && typeof json === 'object' ? json : null) as Record<string, unknown> | null;
  const data = (root?.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown> | null;
  const prompts = data?.prompts;
  if (!Array.isArray(prompts) || !prompts.length) {
    throw new Error('没有找到预设条目(prompts),请导入酒馆的聊天补全预设 JSON');
  }
  const byId = new Map<string, STPromptRaw>();
  for (const p of prompts as STPromptRaw[]) {
    if (p && typeof p === 'object' && typeof p.identifier === 'string' && p.identifier) {
      if (!byId.has(p.identifier)) byId.set(p.identifier, p);
    }
  }
  const order = pickOrder(data?.prompt_order);
  const sequence: { id: string; enabled: boolean | null }[] = [];
  const placed = new Set<string>();
  for (const item of order ?? []) {
    const id = typeof item?.identifier === 'string' ? item.identifier : '';
    if (!id || placed.has(id) || !byId.has(id)) continue;
    placed.add(id);
    sequence.push({ id, enabled: typeof item.enabled === 'boolean' ? item.enabled : true });
  }
  for (const id of byId.keys()) {
    if (placed.has(id)) continue;
    // 没有 order 时全都按条目自身开关;有 order 时不在里面的就是酒馆不会发的
    sequence.push({ id, enabled: order ? false : null });
  }

  const entries: HeavyEntry[] = [];
  let slotPlaced = false;
  for (const { id, enabled } of sequence) {
    const p = byId.get(id)!;
    if (id === CHAT_HISTORY_ID) {
      if (!slotPlaced) entries.push(heavySlotEntry());
      slotPlaced = true;
      continue;
    }
    if (p.marker === true) continue;
    const triggers = Array.isArray(p.injection_trigger) ? p.injection_trigger : [];
    const triggerOk = !triggers.length || triggers.includes('normal');
    const selfEnabled = typeof p.enabled === 'boolean' ? p.enabled : true;
    entries.push({
      id,
      name: typeof p.name === 'string' && p.name.trim() ? p.name : id,
      role: normalizeRole(p.role),
      content: typeof p.content === 'string' ? p.content : '',
      enabled: (enabled ?? selfEnabled) && triggerOk,
      position: Number(p.injection_position) === 1 ? 'depth' : 'relative',
      depth: finiteInt(p.injection_depth, 4),
      order: finiteInt(p.injection_order, 100, Number.MIN_SAFE_INTEGER),
    });
  }
  if (!slotPlaced) entries.push(heavySlotEntry());
  return { entries, promptCount: entries.length - 1 };
}

/**
 * 按条目拼出重型请求的消息链。
 *
 * - 相对条目按列表顺序;占位条目展开成整条默认消息链(defaultMessages)。
 * - 深度条目插进默认消息链(柏宝绘的「聊天记录」),规则与酒馆一致:深度 0 在链尾,
 *   深度 N 在倒数第 N 条之前;同深度按 order 从小到大,同 order 内同身份的条目合并为一条。
 * - 关闭的、内容为空的条目跳过;substitute 用来展开 {{char}}/{{user}} 等酒馆宏(只作用于预设条目)。
 */
export function assembleHeavyMessages(
  entries: HeavyEntry[],
  defaultMessages: ChatMsg[],
  substitute: (text: string) => string = text => text,
): ChatMsg[] {
  const live = entries
    .filter(e => e.id === HEAVY_SLOT_ID || e.enabled)
    .map(e => (e.id === HEAVY_SLOT_ID ? e : { ...e, content: substitute(e.content) }))
    .filter(e => e.id === HEAVY_SLOT_ID || e.content.trim());

  // 与酒馆 populationInjectionPrompts 同算法:在倒序的聊天里按深度逐组插入,再翻回来
  const chat = defaultMessages.slice().reverse();
  const depthEntries = live.filter(e => e.id !== HEAVY_SLOT_ID && e.position === 'depth');
  let inserted = 0;
  const depths = [...new Set(depthEntries.map(e => e.depth))].sort((a, b) => a - b);
  for (const depth of depths) {
    const atDepth = depthEntries.filter(e => e.depth === depth);
    const orders = [...new Set(atDepth.map(e => e.order))].sort((a, b) => b - a);
    for (const order of orders) {
      const group = atDepth.filter(e => e.order === order);
      const roleMessages: ChatMsg[] = [];
      for (const role of ['system', 'user', 'assistant'] as const) {
        const content = group
          .filter(e => e.role === role)
          .map(e => e.content)
          .join('\n');
        if (content) roleMessages.push({ role, content });
      }
      if (!roleMessages.length) continue;
      chat.splice(Math.min(depth + inserted, chat.length), 0, ...roleMessages);
      inserted += roleMessages.length;
    }
  }
  const chatBlock = chat.reverse();

  const out: ChatMsg[] = [];
  for (const e of live) {
    if (e.id === HEAVY_SLOT_ID) out.push(...chatBlock);
    else if (e.position === 'relative') out.push({ role: e.role, content: e.content });
  }
  return out;
}
