import { describe, expect, it } from 'vitest';

import { drawFull, hasNew, NOTHING_DRAWN } from './appendText';

function fakeNode() {
  const node = { data: '', appends: 0, appendData(s: string) { this.data += s; this.appends++; } };
  return node;
}

describe('实时输出显示全文、只追加新内容', () => {
  it('同一条请求只追加新来的那截', () => {
    const node = fakeNode();
    let drawn = drawFull(node, { id: 1, text: 'abc', total: 3 }, NOTHING_DRAWN);
    expect(node.data).toBe('abc');
    drawn = drawFull(node, { id: 1, text: 'abcdef', total: 6 }, drawn);
    expect(node.data).toBe('abcdef');
    expect(node.appends).toBe(1);
    expect(hasNew({ id: 1, text: 'abcdef', total: 6 }, drawn)).toBe(false);
  });

  it('换了一条请求就整段重画', () => {
    const node = fakeNode();
    const drawn = drawFull(node, { id: 1, text: 'abc', total: 3 }, NOTHING_DRAWN);
    drawFull(node, { id: 2, text: 'xy', total: 2 }, drawn);
    expect(node.data).toBe('xy');
    expect(node.appends).toBe(0);
  });

  it('超过上限被从前面截掉时整段重画并注明', () => {
    const node = fakeNode();
    const drawn = drawFull(node, { id: 1, text: 'abcdef', total: 6 }, NOTHING_DRAWN);
    drawFull(node, { id: 1, text: 'defgh', total: 8 }, drawn);
    expect(node.data).toBe('…（前面还有 3 字）\ndefgh');
  });
});
