import { reactive } from 'vue';

import { parseSize, pickSize } from '@/backends/size';
import type { NaiSettings } from '@/state/settings';

import { FREE_ONLY_TAG } from './tag';

export { FREE_ONLY_TAG, isFreeOnlyBlock } from './tag';

/**
 * NovelAI 官方订阅额度与 Anlas(本 fork 独有)。
 *
 * 官方 /user/subscription 返回订阅档位、免费出图范围(perks.unlimitedImageGenerationLimits)
 * 和 Anlas 余额(trainingStepsLeft)。这里负责:查询并缓存、估算一张图免费还是扣多少 Anlas、
 * 以及「只用免费额度」开着时在发请求前拦下会扣 Anlas 的图。
 *
 * 只对官方接入点生效:第三方站没有这个接口,各站额度规则也不同,查不到就不拦。
 */

export interface NaiFreeLimit {
  /** 像素上限(宽×高) */
  resolution: number;
  /** 一次最多几张 */
  maxPrompts: number;
}

export interface NaiQuota {
  tier: number;
  tierName: string;
  active: boolean;
  /** 订阅到期时间(毫秒);没有返回 null */
  expiresAt: number | null;
  /** Anlas 余额(订阅送的 + 自己买的);查不到返回 null */
  anlas: number | null;
  /** 免费出图范围;空数组 = 没有免费额度 */
  freeLimits: NaiFreeLimit[];
  fetchedAt: number;
}

/** 免费出图的步数上限(官方前端写死 28 步,超过就扣 Anlas)。 */
export const FREE_MAX_STEPS = 28;
/** 订阅接口没给 perks 时按 Opus 的规则兜底:1024×1024 像素以内、一次 1 张。 */
const OPUS_FALLBACK: NaiFreeLimit[] = [{ resolution: 1024 * 1024, maxPrompts: 1 }];

export const TIER_NAMES = ['免费', 'Tablet', 'Scroll', 'Opus'];

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 解析 /user/subscription 的返回。字段缺了就按最保守的理解(没有免费额度、余额未知)。 */
export function parseSubscription(data: unknown, now = Date.now()): NaiQuota {
  const o = (data ?? {}) as Record<string, any>;
  const sub = (o.subscription && typeof o.subscription === 'object' ? o.subscription : o) as Record<string, any>;
  const tier = num(sub.tier) ?? 0;
  const active = sub.active !== false;
  const perks = (sub.perks ?? {}) as Record<string, any>;
  let freeLimits: NaiFreeLimit[] = [];
  if (active && perks.unlimitedImageGeneration && Array.isArray(perks.unlimitedImageGenerationLimits)) {
    freeLimits = perks.unlimitedImageGenerationLimits
      .map((l: any) => ({ resolution: num(l?.resolution) ?? 0, maxPrompts: num(l?.maxPrompts) ?? 0 }))
      .filter((l: NaiFreeLimit) => l.resolution > 0 && l.maxPrompts > 0);
  } else if (active && tier === 3 && perks.unlimitedImageGeneration === undefined) {
    freeLimits = OPUS_FALLBACK;
  }
  const steps = (sub.trainingStepsLeft ?? o.trainingStepsLeft) as Record<string, any> | undefined;
  const fixed = num(steps?.fixedTrainingStepsLeft);
  const bought = num(steps?.purchasedTrainingSteps);
  const anlas = fixed === null && bought === null ? null : (fixed ?? 0) + (bought ?? 0);
  const expires = num(sub.expiresAt);
  return {
    tier,
    tierName: TIER_NAMES[tier] ?? `Tier ${tier}`,
    active,
    // 官方给的是秒
    expiresAt: expires && expires > 0 ? (expires < 1e12 ? expires * 1000 : expires) : null,
    anlas,
    freeLimits,
    fetchedAt: now,
  };
}

/** 一张图大约扣多少 Anlas(官方前端的公式;不含 vibe 编码等额外费用)。 */
export function anlasCost(width: number, height: number, steps: number, samples = 1): number {
  const pixels = width * height;
  const each = Math.ceil(2.951823174884865e-6 * pixels + 5.753298233447344e-7 * pixels * steps);
  return Math.max(2, each) * samples;
}

export function isFreeGen(quota: NaiQuota, width: number, height: number, steps: number, samples = 1): boolean {
  if (steps > FREE_MAX_STEPS) return false;
  const pixels = width * height;
  return quota.freeLimits.some(l => pixels <= l.resolution && samples <= l.maxPrompts);
}

export interface GenEstimate {
  width: number;
  height: number;
  steps: number;
  free: boolean;
  cost: number;
}

export function estimateGen(quota: NaiQuota, width: number, height: number, steps: number): GenEstimate {
  const free = isFreeGen(quota, width, height, steps);
  return { width, height, steps, free, cost: free ? 0 : anlasCost(width, height, steps) };
}

/** 竖图、横图两种画幅各估一次(尺寸写错的那格跳过)。 */
export function estimateBoth(quota: NaiQuota, nai: Pick<NaiSettings, 'portraitSize' | 'landscapeSize' | 'steps'>): Array<GenEstimate & { label: string }> {
  const out: Array<GenEstimate & { label: string }> = [];
  for (const [label, orientation] of [['竖图', 'portrait'], ['横图', 'landscape']] as const) {
    const size = parseSize(pickSize(nai, orientation) || (orientation === 'portrait' ? '832×1216' : '1216×832'));
    if (size) out.push({ label, ...estimateGen(quota, size.width, size.height, nai.steps) });
  }
  return out;
}

/**
 * 与 settings.NAI_OFFICIAL_URL 相同。不从 settings 引:backends/nai.ts 要引本模块,
 * 而 settings 初始化时要读 nai.ts 的内置画师串,引了就成环、加载顺序一错就崩。
 */
const OFFICIAL_URL = 'https://image.novelai.net';

export function isOfficialUrl(url: string): boolean {
  return String(url ?? '').trim().replace(/\/+$/, '') === OFFICIAL_URL;
}

/* —— 查询与缓存 —— */

export const quotaState = reactive({
  quota: null as NaiQuota | null,
  /** 查询失败的原因;成功后清空 */
  error: '',
  loading: false,
  /** 缓存属于哪个 key(换了 key 就作废) */
  key: '',
});

/** 缓存多久内直接用(出图前的检查不必每张都查一次)。 */
const FRESH_MS = 60_000;

/**
 * 订阅与 Anlas 的查询地址。NovelAI 已把它从 api.novelai.net 挪到出图域名下
 * (旧地址现在回 400「update to the image URL」),路径没有 /ai/ 前缀(带了是 404)。
 * 旧地址留作后备,万一哪天又挪回去。
 */
export const NAI_SUBSCRIPTION_URLS = [
  'https://image.novelai.net/user/subscription',
  'https://api.novelai.net/user/subscription',
] as const;

async function fetchSubscription(nai: Pick<NaiSettings, 'key'>, signal?: AbortSignal): Promise<unknown> {
  const headers = { Authorization: `Bearer ${nai.key.trim()}` };
  let firstError: unknown = null;
  for (const url of NAI_SUBSCRIPTION_URLS) {
    try {
      const resp = await fetch(url, { headers, signal });
      if (resp.status === 401) throw new Error('API Key 无效(401)');
      if (!resp.ok) throw new Error(`订阅接口返回 ${resp.status}`);
      return await resp.json();
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.message.includes('401'))) throw error;
      // 报主地址的错:后备地址的错(多半是旧地址的 400)只会误导
      firstError ??= error;
    }
  }
  throw firstError instanceof Error ? firstError : new Error('订阅接口不可用');
}

/** 查一次订阅与 Anlas。官方接入点之外返回 null。 */
export async function refreshNaiQuota(nai: Pick<NaiSettings, 'url' | 'key'>, signal?: AbortSignal): Promise<NaiQuota | null> {
  if (!isOfficialUrl(nai.url) || !nai.key.trim()) return null;
  quotaState.loading = true;
  try {
    const quota = parseSubscription(await fetchSubscription(nai, signal));
    quotaState.quota = quota;
    quotaState.key = nai.key.trim();
    quotaState.error = '';
    return quota;
  } catch (error) {
    quotaState.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    quotaState.loading = false;
  }
}

async function freshQuota(nai: Pick<NaiSettings, 'url' | 'key'>): Promise<NaiQuota | null> {
  const cached = quotaState.quota;
  if (cached && quotaState.key === nai.key.trim() && Date.now() - cached.fetchedAt < FRESH_MS) return cached;
  return refreshNaiQuota(nai);
}


/**
 * 出图前的检查(generateNaiImage 里调用):开了「只用免费额度」、走官方接入点、
 * 这张会扣 Anlas 时抛错,不发请求。查不到订阅状态也不发——宁可不出图,不能误扣。
 */
export async function assertNaiFreeAllowed(
  nai: Pick<NaiSettings, 'url' | 'key' | 'freeOnly'>,
  params: { width?: unknown; height?: unknown; steps?: unknown; n_samples?: unknown },
): Promise<void> {
  if (!nai.freeOnly || !isOfficialUrl(nai.url)) return;
  const width = Number(params.width);
  const height = Number(params.height);
  const steps = Number(params.steps);
  const samples = Number(params.n_samples) || 1;
  let quota: NaiQuota | null;
  try {
    quota = await freshQuota(nai);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new Error(`${FREE_ONLY_TAG}查不到 NovelAI 订阅状态（${why}），为了不误扣 Anlas 没有出图`);
  }
  if (!quota) return;
  if (isFreeGen(quota, width, height, steps, samples)) return;
  const reason = quota.freeLimits.length
    ? `超出免费范围（${describeFreeLimits(quota)}）`
    : `${quota.tierName}${quota.active ? '' : '（未激活）'}没有免费出图额度`;
  throw new Error(
    `${FREE_ONLY_TAG}这张 ${width}×${height}、${steps} 步会扣约 ${anlasCost(width, height, steps, samples)} Anlas：${reason}。已开启「只用免费额度」，没有出图`,
  );
}

export function describeFreeLimits(quota: NaiQuota): string {
  const best = [...quota.freeLimits].sort((a, b) => b.resolution - a.resolution)[0];
  if (!best) return '没有免费额度';
  const side = Math.round(Math.sqrt(best.resolution));
  return `${side}×${side} 像素以内、${FREE_MAX_STEPS} 步以内`;
}
