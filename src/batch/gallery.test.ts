import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/st/images', () => ({
  probeUserImage: vi.fn(async (path: string) => ({ exists: !path.includes('gone') })),
}));

import { checkSlotFiles, filterSlots, listSlots, readSlot } from '@/batch/gallery';
import { isImageMissing, resetMissingImages } from '@/floor/missingImages';
import { BBI_IMAGE_EXTRA_KEY, promptHash } from '@/floor/storage';
import type { STMessage } from '@/st/context';

const TAG_A = '<bbi_image>1girl, forest<size>landscape</size></bbi_image>';
const TAG_B = '<bbi_image>1girl, river</bbi_image>';
const OLD = '<bbi_image>old</bbi_image>';

const entry = (seq: number, path: string, createdAt = 1) => ({
  generationId: path,
  path,
  slotSeq: seq,
  prompt: '',
  seed: 1,
  status: 'ready',
  createdAt,
});

function aiFloor(mes: string, images: Record<string, unknown[]> = {}): STMessage {
  return { mes, is_user: false, swipe_id: 0, extra: { [BBI_IMAGE_EXTRA_KEY]: { '0': images } } } as unknown as STMessage;
}

const chat: STMessage[] = [
  { mes: TAG_A, is_user: true } as STMessage,
  aiFloor(`a ${TAG_A} b ${TAG_B}`, {
    [promptHash(TAG_A)]: [entry(0, '/user/images/a1.png', 1), entry(0, '/user/images/a2.png', 2)],
    [promptHash(OLD)]: [entry(1, '/user/images/gone-old.png')],
  }),
  aiFloor('no tags'),
  aiFloor(`c ${TAG_B}`),
];

afterEach(() => resetMissingImages());

describe('listSlots', () => {
  it('makes one slot per tag on AI floors in range', () => {
    expect(listSlots(chat, [0, 1, 2, 3])).toEqual([
      { floor: 1, seq: 0 },
      { floor: 1, seq: 1 },
      { floor: 3, seq: 0 },
    ]);
    expect(listSlots(chat, [3])).toEqual([{ floor: 3, seq: 0 }]);
  });
});

describe('readSlot', () => {
  it('reads the history, stale image and parsed size', () => {
    const view = readSlot(chat, { floor: 1, seq: 0 })!;
    expect(view.state).toBe('has');
    expect(view.history.map(item => item.path)).toEqual(['/user/images/a1.png', '/user/images/a2.png']);
    expect(view.content.size).toBe('landscape');
    const stale = readSlot(chat, { floor: 1, seq: 1 })!;
    expect(stale.state).toBe('stale');
    expect(stale.stale?.path).toBe('/user/images/gone-old.png');
  });
  it('returns null when the tag is gone', () => {
    expect(readSlot(chat, { floor: 1, seq: 5 })).toBeNull();
    expect(readSlot(chat, { floor: 9, seq: 0 })).toBeNull();
  });
});

describe('filterSlots', () => {
  const slots = listSlots(chat, [1, 2, 3]);
  it('filters by state and reverses', () => {
    expect(filterSlots(chat, slots, 'has', 'asc')).toEqual([{ floor: 1, seq: 0 }]);
    expect(filterSlots(chat, slots, 'stale', 'asc')).toEqual([{ floor: 1, seq: 1 }]);
    expect(filterSlots(chat, slots, 'none', 'asc')).toEqual([{ floor: 3, seq: 0 }]);
    expect(filterSlots(chat, slots, 'all', 'desc')).toEqual([...slots].reverse());
  });
  it('puts the most recently generated slot first', () => {
    const recent: STMessage[] = [
      ...chat.slice(0, 3),
      aiFloor(`c ${TAG_B}`, { [promptHash(TAG_B)]: [entry(0, '/user/images/c1.png', 5)] }),
      aiFloor(`d ${TAG_B}`),
    ];
    // 楼 3 最新(5),楼 1 第 0 张其次(2),楼 1 第 1 张只有旧图(1),楼 4 没图排最后
    expect(filterSlots(recent, listSlots(recent, [1, 2, 3, 4]), 'all', 'recent')).toEqual([
      { floor: 3, seq: 0 },
      { floor: 1, seq: 0 },
      { floor: 1, seq: 1 },
      { floor: 4, seq: 0 },
    ]);
  });
});

describe('checkSlotFiles', () => {
  it('marks deleted files so the slot counts as having no image', async () => {
    const slots = listSlots(chat, [1, 3]);
    expect(await checkSlotFiles(chat, slots)).toBe(1);
    expect(isImageMissing('/user/images/gone-old.png')).toBe(true);
    expect(isImageMissing('/user/images/a1.png')).toBe(false);
    expect(filterSlots(chat, slots, 'none', 'asc')).toEqual([
      { floor: 1, seq: 1 },
      { floor: 3, seq: 0 },
    ]);
  });
});
