import { afterEach, describe, expect, it, vi } from 'vitest';

import { NAI_OFFICIAL_URL } from '@/state/settings';

import { anlasCost, assertNaiFreeAllowed, estimateGen, isFreeGen, parseSubscription, quotaState } from './quota';
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
    expect(q.freeLimits).toEqual([{ resolution: 1048576, maxPrompts: 1 }]);
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

describe('官方地址常量', () => {
  it('与 settings 里的一致', async () => {
    const { isOfficialUrl } = await import('./quota');
    expect(isOfficialUrl(`${NAI_OFFICIAL_URL}/`)).toBe(true);
  });
});
