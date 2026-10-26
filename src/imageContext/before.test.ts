import { describe, expect, it } from 'vitest';

import { textBeforeImage } from './before';

const tag = (n: number) => `<bbi_image><tag>t${n}</tag></bbi_image>`;

describe('大图下面显示图前面的几段正文', () => {
  it('取紧挨着图的前三段', () => {
    const mes = ['一', '二', '三', '四', tag(1), '五', tag(2)].join('\n');
    expect(textBeforeImage(mes, 0, [])).toEqual({ passages: ['二', '三', '四'], atStart: false });
    expect(textBeforeImage(mes, 1, [])).toEqual({ passages: ['三', '四', '五'], atStart: false });
  });

  it('前面不够三段就有几段给几段', () => {
    expect(textBeforeImage(['一', tag(1), '二'].join('\n'), 0, [])?.passages).toEqual(['一']);
  });

  it('图在正文开头', () => {
    expect(textBeforeImage([tag(1), '一'].join('\n'), 0, [])).toEqual({ passages: [], atStart: true });
  });

  it('长段只留靠近图的结尾', () => {
    const long = '甲'.repeat(100) + '乙'.repeat(160);
    const text = textBeforeImage([long, tag(1)].join('\n'), 0, [])!.passages[0];
    expect(text).toBe(`…${'乙'.repeat(160)}`);
  });

  it('找不到这张图返回 null', () => {
    expect(textBeforeImage('没有图', 0, [])).toBeNull();
  });
});
