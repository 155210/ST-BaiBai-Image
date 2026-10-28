import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nlForSlot, setSlotNoNl, slotNoNl } from './perSlot';

const at = { chatId: 'c', messageId: 3, swipeId: 0, seq: 1 };
const job = { ...at, nl: 'A girl.', characters: [{ name: 'A', tag: 'girl', nl: 'Waving.' }], prompt: '1girl' };

describe('单张图出图不发自然语言', () => {
  beforeEach(() => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    });
  });

  it('没勾照常发', () => {
    expect(slotNoNl(at)).toBe(false);
    expect(nlForSlot(job)).toBe(job);
  });

  it('勾了只清这一张的 nl，取消又照常发', () => {
    setSlotNoNl(at, true);
    expect(nlForSlot(job)).toMatchObject({ nl: '', characters: [{ name: 'A', tag: 'girl', nl: '' }], prompt: '1girl' });
    expect(nlForSlot({ ...job, seq: 0 }).nl).toBe('A girl.');
    setSlotNoNl(at, false);
    expect(nlForSlot(job).nl).toBe('A girl.');
  });

  it('浏览器存不了也不报错', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } });
    expect(() => setSlotNoNl(at, true)).not.toThrow();
    expect(slotNoNl(at)).toBe(false);
  });
});
