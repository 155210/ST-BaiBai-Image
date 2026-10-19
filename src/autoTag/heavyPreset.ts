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
  /** 合并相邻的 system 消息(取自预设的 squash_system_messages,与酒馆同义)。 */
  squash: boolean;
  /**
   * 没在顺序里的条目:预设条目库(prompts)里有、但酒馆条目列表(prompt_order)里没放的。
   * 酒馆里看不到也不发送;这里单独收着、永不发送,用户可以挑出来「加入末尾」。
   */
  extras: HeavyEntry[];
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
  return { enabled: true, name: '', entries: [heavySlotEntry()], squash: false, extras: [] };
}

function normalizeRole(value: unknown): HeavyRole {
  return value === 'user' || value === 'assistant' ? value : 'system';
}

function finiteInt(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : fallback;
}

function normalizeEntry(id: string, e: Partial<HeavyEntry>): HeavyEntry {
  return {
    id,
    name: typeof e.name === 'string' ? e.name : id,
    role: normalizeRole(e.role),
    content: typeof e.content === 'string' ? e.content : '',
    enabled: typeof e.enabled === 'boolean' ? e.enabled : true,
    position: e.position === 'depth' ? 'depth' : 'relative',
    depth: finiteInt(e.depth, 4),
    order: finiteInt(e.order, 100, Number.MIN_SAFE_INTEGER),
  };
}

/**
 * 设置兜底:逐字段补全;占位条目缺了补到末尾、重复的只留第一个,两个列表合起来 id 去重;
 * 没在顺序里的条目(extras)不收占位、一律关闭。
 */
export function normalizeHeavyPreset(raw: unknown): HeavyPresetSettings {
  const d = heavyPresetDefaults();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<HeavyPresetSettings>;
  const seen = new Set<string>();
  const take = (list: unknown, inOrder: boolean): HeavyEntry[] => {
    const out: HeavyEntry[] = [];
    for (const item of Array.isArray(list) ? list : []) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Partial<HeavyEntry>;
      const id = typeof e.id === 'string' && e.id ? e.id : '';
      if (!id || seen.has(id) || (!inOrder && id === HEAVY_SLOT_ID)) continue;
      seen.add(id);
      if (id === HEAVY_SLOT_ID) out.push(heavySlotEntry());
      else out.push(inOrder ? normalizeEntry(id, e) : { ...normalizeEntry(id, e), enabled: false });
    }
    return out;
  };
  const entries = take(r.entries, true);
  if (!seen.has(HEAVY_SLOT_ID)) entries.push(heavySlotEntry());
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    name: typeof r.name === 'string' ? r.name : d.name,
    entries,
    squash: typeof r.squash === 'boolean' ? r.squash : d.squash,
    extras: take(r.extras, false),
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

/** 从 prompt_order 里取一份顺序:优先全局默认(100001),找不到取条目最多的那份(最接近完整的一份)。 */
function pickOrder(rawOrder: unknown): STOrderItem[] | null {
  if (!Array.isArray(rawOrder) || !rawOrder.length) return null;
  // 提示词管理器单独导出的格式:prompt_order 直接就是 [{identifier, enabled}]
  if (rawOrder.every(x => x && typeof x === 'object' && 'identifier' in x)) return rawOrder as STOrderItem[];
  const lists = rawOrder.filter(
    (x): x is { character_id?: unknown; order: STOrderItem[] } =>
      !!x && typeof x === 'object' && Array.isArray((x as { order?: unknown }).order),
  );
  const byId = (id: number) => lists.find(x => Number(x.character_id) === id)?.order;
  return byId(100001) ?? lists.slice().sort((a, b) => b.order.length - a.order.length)[0]?.order ?? null;
}

/**
 * 解析酒馆预设 JSON(整份聊天补全预设,或提示词管理器单独导出的 {data:{prompts,prompt_order}})。
 *
 * - 列表的顺序与开关与酒馆里一模一样:按 prompt_order 排序与取开关。条目库里有、但
 *   prompt_order 没放的条目(酒馆里看不到、也不发)不进列表,单独放进 extras。开关只认
 *   prompt_order[].enabled(酒馆提示词管理器的勾选框写在那里);prompts[].enabled 在导出的
 *   预设里几乎恒为 false 或缺失,不是开关状态,只在整份预设没有 prompt_order 时兜底。
 * - 标记条目(角色卡、世界书、示例对话等,由酒馆现场填充)不导入:柏宝绘的默认提示词已自带
 *   角色卡/人设/世界书;聊天记录标记换成柏宝绘占位条目。没有聊天记录标记时占位放末尾。
 * - 触发器写明了、但不含「正常」的条目导入为关闭(酒馆普通生成时它也不发)。
 * - 「聊天记录」在预设里被关掉也照样放占位(恒启用),否则默认提示词发不出去。
 */
export interface STPresetImport {
  entries: HeavyEntry[];
  /** 没在顺序里的条目(标记条目除外),一律关闭。 */
  extras: HeavyEntry[];
  squash: boolean;
  /** 导入的条目数(不含占位)、其中启用的数目。 */
  promptCount: number;
  enabledCount: number;
  /** 丢弃的占位条目数(角色卡/世界书/示例对话等)。 */
  droppedMarkers: number;
  /** 预设里有没有「聊天记录」;没有时占位追加在末尾。 */
  hadChatHistory: boolean;
}

export function parseSTPreset(json: unknown): STPresetImport {
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
  // 没有 order 时全部按 prompts 原序进列表、按条目自身开关;有 order 时不在里面的是酒馆
  // 不会发的条目,收进 extras
  const orphans: string[] = [];
  for (const id of byId.keys()) {
    if (placed.has(id)) continue;
    if (order) orphans.push(id);
    else sequence.push({ id, enabled: null });
  }

  const toEntry = (id: string, p: STPromptRaw, enabled: boolean | null): HeavyEntry => {
    const triggers = Array.isArray(p.injection_trigger) ? p.injection_trigger : [];
    const triggerOk = !triggers.length || triggers.includes('normal');
    const selfEnabled = typeof p.enabled === 'boolean' ? p.enabled : true;
    return {
      id,
      name: typeof p.name === 'string' && p.name.trim() ? p.name : id,
      role: normalizeRole(p.role),
      content: typeof p.content === 'string' ? p.content : '',
      enabled: (enabled ?? selfEnabled) && triggerOk,
      position: Number(p.injection_position) === 1 ? 'depth' : 'relative',
      depth: finiteInt(p.injection_depth, 4),
      order: finiteInt(p.injection_order, 100, Number.MIN_SAFE_INTEGER),
    };
  };

  const entries: HeavyEntry[] = [];
  let slotPlaced = false;
  let droppedMarkers = 0;
  for (const { id, enabled } of sequence) {
    const p = byId.get(id)!;
    if (id === CHAT_HISTORY_ID) {
      if (!slotPlaced) entries.push(heavySlotEntry());
      slotPlaced = true;
      continue;
    }
    if (p.marker === true) {
      droppedMarkers++;
      continue;
    }
    entries.push(toEntry(id, p, enabled));
  }
  if (!slotPlaced) entries.push(heavySlotEntry());
  const extras = orphans
    .filter(id => id !== CHAT_HISTORY_ID && byId.get(id)!.marker !== true)
    .map(id => toEntry(id, byId.get(id)!, false));
  const imported = entries.filter(e => e.id !== HEAVY_SLOT_ID);
  return {
    entries,
    extras,
    squash: data?.squash_system_messages === true || root?.squash_system_messages === true,
    promptCount: imported.length,
    enabledCount: imported.filter(e => e.enabled).length,
    droppedMarkers,
    hadChatHistory: slotPlaced,
  };
}

/**
 * 按条目拼出重型请求的消息链。
 *
 * - 相对条目按列表顺序;占位条目展开成整条默认消息链(defaultMessages)。
 * - 深度条目插进默认消息链(柏宝绘的「聊天记录」),规则与酒馆一致:深度 0 在链尾,
 *   深度 N 在倒数第 N 条之前;同深度按 order 从小到大,同 order 内同身份的条目合并为一条。
 * - 关闭的、内容为空的条目跳过;substitute 用来展开 {{char}}/{{user}} 等酒馆宏(只作用于预设条目)。
 * - squash 开着时,最终消息里相邻的 system 合并成一条(酒馆「压缩系统消息」同义)。
 */
export function assembleHeavyMessages(
  entries: HeavyEntry[],
  defaultMessages: ChatMsg[],
  substitute: (text: string) => string = text => text,
  squash = false,
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
  if (!squash) return out;
  const squashed: ChatMsg[] = [];
  for (const m of out) {
    const prev = squashed[squashed.length - 1];
    if (prev?.role === 'system' && m.role === 'system') prev.content += `\n\n${m.content}`;
    else squashed.push({ ...m });
  }
  return squashed;
}
