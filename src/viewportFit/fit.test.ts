import { afterEach, describe, expect, it, vi } from 'vitest';

import { correctedTop, fitToViewport } from './fit';

describe('correctedTop', () => {
  it('已对齐时不动', () => {
    expect(correctedTop(0, 0, 0)).toBeNull();
    expect(correctedTop(0, 0.4, 0)).toBeNull();
  });
  it('遮罩被往上推了就往下补', () => {
    expect(correctedTop(0, -56, 0)).toBe(56);
    expect(correctedTop(56, -10, 0)).toBe(66);
  });
});

describe('fitToViewport', () => {
  afterEach(() => vi.unstubAllGlobals());

  function box(rect: { top: number; height: number }): HTMLElement {
    // 没有 DOM 环境:只模拟 fitToViewport 用到的 style 与 getBoundingClientRect
    const style: Record<string, string> = {};
    return { style, getBoundingClientRect: () => rect } as unknown as HTMLElement;
  }

  it('高度和位置都对时一点不改', () => {
    vi.stubGlobal('window', { visualViewport: { offsetTop: 0, height: 800 } });
    const el = box({ top: 0, height: 800 });
    fitToViewport(el);
    expect(el.style).toEqual({});
  });

  it('矮了一截、往上偏了:补高度、往下挪', () => {
    vi.stubGlobal('window', { visualViewport: { offsetTop: 0, height: 800 } });
    const el = box({ top: -40, height: 700 });
    fitToViewport(el);
    expect(el.style.height).toBe('800px');
    expect(el.style.bottom).toBe('auto');
    expect(el.style.top).toBe('40px');
  });
});
