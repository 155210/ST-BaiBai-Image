import { describe, expect, it } from 'vitest';

import { unsavedFloors } from '@/batch/verifySaved';
import { BBI_CHAR_EXTRA_KEY } from '@/state/charTags';
import type { STMessage } from '@/st/context';

function message(mes: string, delta?: unknown): STMessage {
  return { mes, is_user: false, extra: delta === undefined ? {} : { [BBI_CHAR_EXTRA_KEY]: delta } } as STMessage;
}

describe('unsavedFloors', () => {
  it('flags floors whose text or character delta differs from the saved file', () => {
    const memory = [message('a'), message('b <bbi_image>x</bbi_image>'), message('c', { ops: [1] }), message('d')];
    const saved = [message('a'), message('b'), message('c'), message('d')];
    expect(unsavedFloors(memory, saved, [0, 1, 2, 3])).toEqual([1, 2]);
  });

  it('flags floors whose image pointers were not saved', () => {
    const memory = [{ ...message('a'), extra: { bbiImage: { 0: { h: [{ path: 'x.png' }] } } } } as STMessage];
    expect(unsavedFloors(memory, [message('a')], [0])).toEqual([0]);
  });

  it('only checks the floors it is asked about, and flags floors missing on disk', () => {
    const memory = [message('a'), message('b'), message('c')];
    const saved = [message('x'), message('b')];
    expect(unsavedFloors(memory, saved, [1, 2])).toEqual([2]);
  });
});
