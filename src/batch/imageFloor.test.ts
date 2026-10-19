import { afterEach, describe, expect, it } from 'vitest';

import { pendingImageSeqs } from '@/batch/imageFloor';
import { markImageMissing, resetMissingImages } from '@/floor/missingImages';
import { BBI_IMAGE_EXTRA_KEY, promptHash } from '@/floor/storage';
import type { STMessage } from '@/st/context';

const TAG_A = '<bbi_image>1girl, forest</bbi_image>';
const TAG_B = '<bbi_image>1girl, river</bbi_image>';

function floor(mes: string, images: Record<string, unknown[]> = {}, swipe = 0): STMessage {
  return {
    mes,
    is_user: false,
    swipe_id: swipe,
    extra: { [BBI_IMAGE_EXTRA_KEY]: { [String(swipe)]: images } },
  } as unknown as STMessage;
}

const entry = (seq: number, path = `img${seq}.png`) => ({ path, slotSeq: seq, prompt: '', seed: 1, status: 'ready' });

afterEach(() => resetMissingImages());

describe('pendingImageSeqs', () => {
  it('lists tags whose current prompt has no image yet', () => {
    const message = floor(`a\n${TAG_A}\nb\n${TAG_B}`, { [promptHash(TAG_A)]: [entry(0)] });
    expect(pendingImageSeqs(message)).toEqual([1]);
  });

  it('counts a slot that only has an image for an older prompt as pending', () => {
    const message = floor(`a\n${TAG_A}`, { [promptHash('<bbi_image>old</bbi_image>')]: [entry(0)] });
    expect(pendingImageSeqs(message)).toEqual([0]);
  });

  it('counts a slot whose image file was deleted as pending', () => {
    markImageMissing('gone.png');
    const message = floor(`a\n${TAG_A}`, { [promptHash(TAG_A)]: [entry(0, 'gone.png')] });
    expect(pendingImageSeqs(message)).toEqual([0]);
  });

  it('ignores user floors and floors without tags', () => {
    expect(pendingImageSeqs({ ...floor(TAG_A), is_user: true } as STMessage)).toEqual([]);
    expect(pendingImageSeqs(floor('just text'))).toEqual([]);
    expect(pendingImageSeqs(undefined)).toEqual([]);
  });

  it('reads the images of the active swipe only', () => {
    const message = floor(`a\n${TAG_A}`, { [promptHash(TAG_A)]: [entry(0)] }, 1);
    expect(pendingImageSeqs(message)).toEqual([]);
    expect(pendingImageSeqs({ ...message, swipe_id: 0 } as STMessage)).toEqual([0]);
  });
});
