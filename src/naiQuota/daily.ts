import { reactive } from 'vue';

import type { GenerationMeta } from '@/generationMeta';
import { effectiveNai, NAI_MODELS } from '@/state/settings';

import { anlasCost, isFreeGen, isOfficialUrl, quotaState, refreshNaiQuota } from './quota';

/**
 * 每天出了几张图(本 fork 独有)。每出成一张记一笔,按本机日期分天、按模型分开,NAI 官方的
 * 再分免费 / 扣 Anlas(按出图那一刻查到的订阅估,扣的 Anlas 也是估算)。
 *
 * 存在浏览器 localStorage 里,只记这台设备;不进设置,导出 / 导入设置不带它。
 */

const STORAGE_KEY = 'bbi-daily-gen-stats';
/** 只留最近这么多天 */
const KEEP_DAYS = 60;

/** 某一天里某个模型出的图 */
export interface ModelStat {
  total: number;
  free: number;
  paid: number;
  anlas: number;
}

export interface DayStat {
  /** 本机日期 YYYY-MM-DD */
  date: string;
  /** 一共出了几张(所有后端) */
  total: number;
  /** NAI(官方与第三方) */
  nai: number;
  comfy: number;
  /** NAI 官方:按出图时的订阅判断免费的 */
  free: number;
  /** NAI 官方:会扣 Anlas 的 */
  paid: number;
  /** 扣 Anlas 那几张估算一共多少 */
  anlas: number;
  /** 按模型分:键见 modelKey */
  models: Record<string, ModelStat>;
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(date: string): DayStat {
  return { date, total: 0, nai: 0, comfy: 0, free: 0, paid: 0, anlas: 0, models: {} };
}

function emptyModel(): ModelStat {
  return { total: 0, free: 0, paid: 0, anlas: 0 };
}

/** 模型的记录键:NAI 用模型标识,ComfyUI 用预设名(前面带后端,免得重名)。 */
export function modelKey(backend: 'nai' | 'comfyui', model: string | undefined): string {
  return `${backend === 'nai' ? 'nai' : 'comfy'}:${String(model ?? '').trim() || '未知'}`;
}

/** 下拉里显示的名字:「NAI 5 Full」「ComfyUI · 预设名」 */
export function modelLabel(key: string): string {
  const [backend, ...rest] = key.split(':');
  const id = rest.join(':');
  if (backend === 'comfy') return `ComfyUI · ${id}`;
  const known = NAI_MODELS.find(m => m.value === id);
  return known ? known.label.replace(/[(（].*$/, '').trim() : id;
}

/** 某天某模型的张数;model 为空串 = 所有模型合计。 */
export function statFor(day: DayStat, model: string): ModelStat {
  if (!model) return day;
  return day.models[model] ?? emptyModel();
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function load(): Record<string, DayStat> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, DayStat> = {};
    for (const [date, v] of Object.entries(raw as Record<string, any>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !v || typeof v !== 'object') continue;
      const models: Record<string, ModelStat> = {};
      if (v.models && typeof v.models === 'object') {
        for (const [key, m] of Object.entries(v.models as Record<string, any>)) {
          if (m && typeof m === 'object') models[key] = { total: count(m.total), free: count(m.free), paid: count(m.paid), anlas: count(m.anlas) };
        }
      }
      out[date] = { date, total: count(v.total), nai: count(v.nai), comfy: count(v.comfy), free: count(v.free), paid: count(v.paid), anlas: count(v.anlas), models };
    }
    return out;
  } catch {
    return {};
  }
}

function store(days: Record<string, DayStat>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
  } catch {
    // 存不下(隐私模式 / 空间满)就算了,不影响出图
  }
}

export const dailyState = reactive({ days: load() });

/** 最近几天里出过图的模型,出得多的在前。 */
export function modelsIn(days: DayStat[]): string[] {
  const sums = new Map<string, number>();
  for (const d of days) for (const [key, m] of Object.entries(d.models)) sums.set(key, (sums.get(key) ?? 0) + m.total);
  return [...sums.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

/** 最近几天,新的在前;没出图的日子也列出来(张数 0),今天总在第一行。 */
export function recentDays(n: number, now = Date.now()): DayStat[] {
  const out: DayStat[] = [];
  const d = new Date(now);
  for (let i = 0; i < n; i++, d.setDate(d.getDate() - 1)) {
    const date = dayKey(d.getTime());
    out.push(dailyState.days[date] ?? emptyDay(date));
  }
  return out;
}

export interface GenKind {
  backend: 'nai' | 'comfyui';
  /** NAI 模型标识 / ComfyUI 预设名 */
  model: string;
  /** NAI 官方时:免费 / 扣 Anlas;判断不了(第三方、查不到订阅)为 null */
  free: boolean | null;
  anlas: number;
}

/** 这张图算哪一类。NAI 官方按缓存的订阅估(与出图前「只用免费额度」的检查同一口径)。 */
export function classifyGen(meta: Pick<GenerationMeta, 'backend' | 'model' | 'width' | 'height' | 'params'>): GenKind {
  const model = String(meta.model ?? '');
  if (meta.backend !== 'nai') return { backend: 'comfyui', model, free: null, anlas: 0 };
  const nai = effectiveNai();
  const quota = quotaState.quota;
  if (!isOfficialUrl(nai.url) || !quota || quotaState.key !== nai.key.trim()) return { backend: 'nai', model, free: null, anlas: 0 };
  const steps = Number(meta.params?.steps) || nai.steps;
  const free = isFreeGen(quota, meta.width, meta.height, steps, 1, meta.model);
  return { backend: 'nai', model, free, anlas: free ? 0 : anlasCost(meta.width, meta.height, steps) };
}

export function addGen(kind: GenKind, now = Date.now()): void {
  const date = dayKey(now);
  const day = dailyState.days[date] ?? (dailyState.days[date] = emptyDay(date));
  const key = modelKey(kind.backend, kind.model);
  const per = day.models[key] ?? (day.models[key] = emptyModel());
  if (kind.backend === 'nai') day.nai++;
  else day.comfy++;
  for (const stat of [day, per]) {
    stat.total++;
    if (kind.free === true) stat.free++;
    if (kind.free === false) {
      stat.paid++;
      stat.anlas += kind.anlas;
    }
  }
  // 只删太旧的:本机时钟往回调过时,比「今天」新的那几天照样留着
  const oldest = recentDays(KEEP_DAYS, now)[KEEP_DAYS - 1].date;
  for (const key of Object.keys(dailyState.days)) if (key < oldest) delete dailyState.days[key];
  store(dailyState.days);
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 出成一张图后调用(generate.ts 里)。NAI 官方的顺便过几秒重查一次订阅,
 * 让 Anlas 余额、免费额度跟着变;连着出图时只查最后一次。
 */
export function recordDailyGen(meta: Pick<GenerationMeta, 'backend' | 'model' | 'width' | 'height' | 'params'>): void {
  try {
    addGen(classifyGen(meta));
    if (meta.backend !== 'nai' || !isOfficialUrl(effectiveNai().url)) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshNaiQuota(effectiveNai()).catch(() => undefined);
    }, 3000);
  } catch (error) {
    console.warn('[柏宝绘] 记每日出图张数失败:', error);
  }
}
