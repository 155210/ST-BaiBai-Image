import { afterEach, describe, expect, it, vi } from 'vitest';

import { NAI_OFFICIAL_URL } from '@/state/settings';

import { anlasCost, assertNaiFreeAllowed, describeBattery, estimateGen, isFreeGen, parseSubscription, quotaState, refreshNaiQuota } from './quota';
import { isFreeOnlyBlock } from './tag';

const OPUS = {
  tier: 3,
  active: true,
  expiresAt: 1798761600,
  perks: {
    unlimitedImageGeneration: true,
    unlimitedImageGenerationLimits: [
      { resolution: 4194304, maxPrompts: 0 },
      { resolution: 1048576, maxPrompts: 1 },
    ],
  },
  trainingStepsLeft: { fixedTrainingStepsLeft: 9800, purchasedTrainingSteps: 500 },
};

describe('parseSubscription', () => {
  it('Opus:档位、到期(秒转毫秒)、Anlas = 订阅送的 + 买的、免费范围', () => {
    const q = parseSubscription(OPUS, 1);
    expect(q.tierName).toBe('Opus');
    expect(q.expiresAt).toBe(1798761600000);
    expect(q.anlas).toBe(10300);
    expect([q.anlasFixed, q.anlasPurchased]).toEqual([9800, 500]);
    expect(q.freeLimits).toEqual([{ resolution: 1048576, maxPrompts: 1 }]);
  });

  it('trainingStepsLeft 直接给总数也认', () => {
    const q = parseSubscription({ ...OPUS, trainingStepsLeft: 8749 });
    expect(q.anlas).toBe(8749);
    expect([q.anlasFixed, q.anlasPurchased]).toEqual([null, null]);
  });

  it('Scroll 没有免费出图', () => {
    const q = parseSubscription({ tier: 2, active: true, perks: { unlimitedImageGeneration: false }, trainingStepsLeft: { fixedTrainingStepsLeft: 1000 } });
    expect(q.freeLimits).toEqual([]);
    expect(q.anlas).toBe(1000);
  });

  it('订阅过期:没有免费出图', () => {
    expect(parseSubscription({ ...OPUS, active: false }).freeLimits).toEqual([]);
  });

  it('余额字段缺了就是查不到', () => {
    expect(parseSubscription({ tier: 3, active: true }).anlas).toBeNull();
  });
});

describe('免费判断与估价', () => {
  const q = parseSubscription(OPUS);

  it('832×1216、28 步免费;29 步不免费', () => {
    expect(isFreeGen(q, 832, 1216, 28)).toBe(true);
    expect(isFreeGen(q, 832, 1216, 29)).toBe(false);
  });

  it('超过 1024×1024 像素不免费', () => {
    expect(isFreeGen(q, 1216, 1216, 28)).toBe(false);
  });

  it('官方公式:832×1216、28 步约 20 Anlas;最少 2', () => {
    expect(anlasCost(832, 1216, 28)).toBe(20);
    expect(anlasCost(256, 256, 1)).toBe(2);
    expect(estimateGen(q, 1216, 1216, 28)).toMatchObject({ free: false, cost: anlasCost(1216, 1216, 28) });
  });
});

describe('assertNaiFreeAllowed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    quotaState.quota = null;
    quotaState.key = '';
  });

  const nai = (freeOnly: boolean, url = NAI_OFFICIAL_URL) => ({ url, key: 'k', freeOnly });
  const stubFetch = (body: unknown, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it('没开开关:不查也不拦', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(assertNaiFreeAllowed(nai(false), { width: 2048, height: 2048, steps: 50 })).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('第三方接入点:不拦', async () => {
    await expect(assertNaiFreeAllowed(nai(true, 'https://example.com'), { width: 2048, height: 2048, steps: 50 })).resolves.toBeUndefined();
  });

  it('免费范围内放行,超出就拦,错误带固定开头', async () => {
    stubFetch(OPUS);
    await expect(assertNaiFreeAllowed(nai(true), { width: 832, height: 1216, steps: 28, n_samples: 1 })).resolves.toBeUndefined();
    const error = await assertNaiFreeAllowed(nai(true), { width: 1216, height: 1216, steps: 28, n_samples: 1 }).catch(e => e);
    expect(isFreeOnlyBlock(error.message)).toBe(true);
    expect(error.message).toContain('Anlas');
  });

  it('查不到订阅状态:宁可不出', async () => {
    stubFetch({}, 500);
    const error = await assertNaiFreeAllowed(nai(true), { width: 832, height: 1216, steps: 28 }).catch(e => e);
    expect(isFreeOnlyBlock(error.message)).toBe(true);
  });
});

describe('V5 电量', () => {
  const withBattery = (percent: number, extra: Record<string, unknown> = {}) =>
    parseSubscription({ ...OPUS, usage: { percent, isNegative: false, timeUntilNextPercent: 7888, ...extra } });

  it('解析 usage:剩余百分比、是否用完、回复速度', () => {
    const q = withBattery(45);
    expect(q.battery).toEqual({ percent: 45, empty: false, secondsToNext: 7888 });
    expect(describeBattery(q.battery!)).toBe('剩 45%（约 779 张），每天回 11%（约 190 张），约 5 天回满');
    // 和 NovelAI App 上的读数对得上:剩 32% ≈ 554 张
    expect(describeBattery(withBattery(32).battery!)).toBe('剩 32%（约 554 张），每天回 11%（约 190 张），约 7 天回满');
    expect(describeBattery(withBattery(100).battery!)).toBe('剩 100%（约 1730 张）');
    expect(describeBattery(withBattery(95).battery!)).toBe('剩 95%（约 1644 张），每天回 11%（约 190 张），约 11 小时回满');
    expect(parseSubscription(OPUS).battery).toBeNull();
    expect(withBattery(3, { isNegative: true }).battery?.empty).toBe(true);
  });

  it('电量用完:V5 不再免费,其他模型不受影响', () => {
    const q = withBattery(0);
    expect(isFreeGen(q, 832, 1216, 28, 1, 'nai-diffusion-5-full')).toBe(false);
    expect(isFreeGen(q, 832, 1216, 28, 1, 'nai-diffusion-4-5-full')).toBe(true);
    expect(isFreeGen(withBattery(45), 832, 1216, 28, 1, 'nai-diffusion-5-full')).toBe(true);
  });

  it('开着「只用免费额度」时电量用完就拦,原因写清楚', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...OPUS, usage: { percent: 0 } }), { status: 200 })));
    const error = await assertNaiFreeAllowed(
      { url: NAI_OFFICIAL_URL, key: 'k2', freeOnly: true, model: 'nai-diffusion-5-full' },
      { width: 832, height: 1216, steps: 28 },
    ).catch(e => e);
    expect(isFreeOnlyBlock(error.message)).toBe(true);
    expect(error.message).toContain('电量用完');
    vi.unstubAllGlobals();
    quotaState.quota = null;
    quotaState.key = '';
  });
});

describe('refreshNaiQuota', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    quotaState.quota = null;
    quotaState.error = '';
  });

  it('查出图域名下的 /user/subscription(不带 /ai/),旧的 api 域名只作后备', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return url === 'https://image.novelai.net/user/subscription'
        ? new Response(JSON.stringify(OPUS), { status: 200 })
        : new Response('{}', { status: 404 });
    }));
    const quota = await refreshNaiQuota({ url: NAI_OFFICIAL_URL, key: 'k' });
    expect(urls).toEqual(['https://image.novelai.net/user/subscription']);
    expect(quota?.tier).toBe(3);
  });

  it('都失败时报主地址的错,不报旧地址的 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response('{}', { status: url.startsWith('https://image.') ? 502 : 400 })));
    await expect(refreshNaiQuota({ url: NAI_OFFICIAL_URL, key: 'k' })).rejects.toThrow('502');
    expect(quotaState.error).toContain('502');
  });
});

describe('官方地址常量', () => {
  it('与 settings 里的一致', async () => {
    const { isOfficialUrl } = await import('./quota');
    expect(isOfficialUrl(`${NAI_OFFICIAL_URL}/`)).toBe(true);
  });
});
