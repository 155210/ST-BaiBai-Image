import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NAI_OFFICIAL_URL, settings } from '@/state/settings';

import { addGen, classifyGen, dailyState, dayKey, recentDays } from './daily';
import { parseSubscription, quotaState } from './quota';

const OPUS = {
  tier: 3,
  active: true,
  perks: { unlimitedImageGeneration: true, unlimitedImageGenerationLimits: [{ resolution: 1048576, maxPrompts: 1 }] },
  trainingStepsLeft: { fixedTrainingStepsLeft: 1000 },
};

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('每日出图张数', () => {
  let stored: Record<string, string>;
  beforeEach(() => {
    stored = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored[k] ?? null,
      setItem: (k: string, v: string) => (stored[k] = v),
    });
    for (const k of Object.keys(dailyState.days)) delete dailyState.days[k];
  });

  it('按本机日期分天,今天在第一行,没出图的日子也列出来', () => {
    addGen({ backend: 'nai', free: true, anlas: 0 }, at(2026, 10, 26));
    addGen({ backend: 'nai', free: false, anlas: 17 }, at(2026, 10, 27, 1));
    addGen({ backend: 'comfyui', free: null, anlas: 0 }, at(2026, 10, 27, 23));
    const days = recentDays(3, at(2026, 10, 27));
    expect(days.map(d => [d.date, d.total])).toEqual([
      ['2026-10-27', 2],
      ['2026-10-26', 1],
      ['2026-10-25', 0],
    ]);
    expect(days[0]).toMatchObject({ nai: 1, comfy: 1, free: 0, paid: 1, anlas: 17 });
    expect(JSON.parse(stored['bbi-daily-gen-stats'])['2026-10-26'].free).toBe(1);
  });

  it('只留最近 60 天', () => {
    addGen({ backend: 'nai', free: null, anlas: 0 }, at(2026, 1, 1));
    addGen({ backend: 'nai', free: null, anlas: 0 }, at(2026, 10, 27));
    expect(Object.keys(dailyState.days)).toEqual([dayKey(at(2026, 10, 27))]);
    // 时钟往回调了:比今天新的那天不删
    addGen({ backend: 'nai', free: null, anlas: 0 }, at(2026, 10, 20));
    expect(Object.keys(dailyState.days).sort()).toEqual(['2026-10-20', '2026-10-27']);
  });

  it('官方 Opus:28 步 1024² 以内算免费,超了算扣 Anlas;第三方判断不了', () => {
    const ep = settings.nai.endpoints.find(e => e.id === settings.nai.activeEndpointId) ?? settings.nai.endpoints[0];
    ep.url = NAI_OFFICIAL_URL;
    ep.key = 'k';
    quotaState.quota = parseSubscription(OPUS);
    quotaState.key = 'k';
    const meta = { backend: 'nai' as const, model: 'nai-diffusion-4-5-full', width: 832, height: 1216, params: { steps: 28 } };
    expect(classifyGen(meta)).toEqual({ backend: 'nai', free: true, anlas: 0 });
    expect(classifyGen({ ...meta, params: { steps: 40 } }).free).toBe(false);
    expect(classifyGen({ ...meta, params: { steps: 40 } }).anlas).toBeGreaterThan(0);
    ep.url = 'https://example.com';
    expect(classifyGen(meta).free).toBeNull();
  });
});
