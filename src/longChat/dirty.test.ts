import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 没有 DOM 环境:用最小的假元素,够 dirty.ts 用就行。 */
class FakeEl {
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  isConnected = true;
  constructor(public cls: string, public id = '') {}
  append(c: FakeEl): FakeEl {
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  matches(sel: string): boolean {
    return sel === `.${this.cls}`;
  }
  closest(sel: string): FakeEl | null {
    let cur: FakeEl | null = this;
    while (cur && !cur.matches(sel)) cur = cur.parentElement;
    return cur;
  }
  querySelectorAll(sel: string): FakeEl[] {
    const out: FakeEl[] = [];
    const walk = (e: FakeEl) => e.children.forEach(c => (c.matches(sel) && out.push(c), walk(c)));
    walk(this);
    return out;
  }
  querySelector(sel: string): FakeEl | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}
vi.stubGlobal('Element', FakeEl);

let root: FakeEl;
vi.stubGlobal('document', { querySelectorAll: () => root.querySelectorAll('.mes') });

const { beginFlush, endFlush, mesToSync, noteMutations } = await import('./dirty');

function chat(n: number): FakeEl {
  const r = new FakeEl('chat');
  for (let i = 0; i < n; i++) r.append(new FakeEl('mes', String(i))).append(new FakeEl('mes_text'));
  return r;
}
const ids = () => [...mesToSync()].map(el => (el as unknown as FakeEl).id);
const rec = (target: FakeEl, extra: { addedNodes?: FakeEl[]; removedNodes?: FakeEl[] } = {}) =>
  ({ target, addedNodes: [], removedNodes: [], ...extra }) as unknown as MutationRecord;
const settle = (key = 'k') => {
  beginFlush(key);
  endFlush();
};

describe('longChat dirty', () => {
  beforeEach(() => {
    root = chat(5);
    settle('reset-' + Math.random());
    settle();
  });

  it('flush 外是全量', () => {
    expect(ids()).toEqual(['0', '1', '2', '3', '4']);
  });

  it('只给变过的楼', () => {
    noteMutations([rec(root.children[3].children[0])]);
    beginFlush('k');
    expect(ids()).toEqual(['3']);
    endFlush();
  });

  it('楼被删 → 全量', () => {
    const gone = root.children.splice(1, 1)[0];
    gone.isConnected = false;
    noteMutations([rec(root, { removedNodes: [gone] })]);
    beginFlush('k');
    expect(ids()).toEqual(['0', '2', '3', '4']);
    endFlush();
  });

  it('新增的楼算进去', () => {
    const m = root.append(new FakeEl('mes', '5'));
    noteMutations([rec(root, { addedNodes: [m] })]);
    beginFlush('k');
    expect(ids()).toEqual(['5']);
    endFlush();
  });

  it('指纹变了 → 全量', () => {
    noteMutations([rec(root.children[2])]);
    beginFlush('k2');
    expect(ids()).toHaveLength(5);
    endFlush();
  });

  it('没变动 → 空', () => {
    beginFlush('k');
    expect(ids()).toEqual([]);
    endFlush();
  });
});
