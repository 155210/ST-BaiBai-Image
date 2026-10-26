import { beforeEach, describe, expect, it, vi } from 'vitest';

const chat: Array<Record<string, any>> = [];
vi.mock('@/st/context', () => ({ getContext: () => ({ chat, getCurrentChatId: () => 'c' }) }));

import { commitFocusSources, drawnPassages, recordSlotSources, rememberFocusSources, SOURCES_KEY } from './sources';

const T = (s: string) => `<bbi_image>${s}<size>portrait</size></bbi_image>`;
const segs = ['第一段', '第二段', '第三段', '第四段'].map((text, i) => ({ id: `P${i + 1}`, text }));
const focus = ['第1张图只画正文 ⟦P1⟧⟦P2⟧ 这部分', '第2张图只画正文 ⟦P4⟧ 这部分'].join('\n');

beforeEach(() => {
  chat.length = 0;
  chat.push({ mes: ['第一段', '第二段', '第三段', '第四段'].join('\n'), swipe_id: 0, extra: {} });
});

describe('按段落记下每张图', () => {
  it('记在写回那一刻的提示词上;再加图时标回那几段', () => {
    const images = [
      { tag: '1girl, a', position: 'P2' },
      { tag: '1girl, b', position: 'P4' },
    ];
    rememberFocusSources(0, images, segs, focus);
    images[0].tag = '1girl, a, replaced'; // runner 写回前还会改提示词
    commitFocusSources(0, 0);
    chat[0].mes = ['第一段', '第二段', T('1girl, a, replaced'), '第三段', '第四段', T('1girl, b')].join('\n');
    expect(drawnPassages(0)).toEqual({ P1: [1], P2: [1], P4: [2] });
  });

  it('提示词改写过就对不上,不标;删掉的图下次写时清掉', () => {
    rememberFocusSources(0, [{ tag: 'x', position: 'P1' }], segs, '这张图只画正文 ⟦P1⟧ 这部分');
    commitFocusSources(0, 0);
    chat[0].mes = `第一段\n${T('y')}\n第二段`;
    expect(drawnPassages(0)).toEqual({});
    recordSlotSources(0, 0, T('y'), ['第二段']);
    expect(Object.keys(chat[0].extra[SOURCES_KEY]['0'])).toHaveLength(1);
    expect(drawnPassages(0)).toEqual({ P2: [1] });
  });

  it('别的楼的待记不会落到这一楼', () => {
    rememberFocusSources(5, [{ tag: 'x', position: 'P1' }], segs, '这张图只画正文 ⟦P1⟧ 这部分');
    commitFocusSources(0, 0);
    expect(chat[0].extra[SOURCES_KEY]).toBeUndefined();
  });
});
