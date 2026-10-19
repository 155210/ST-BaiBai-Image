import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearJob, createJob, loadJob, saveJob } from '@/batch/jobStore';

let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
  });
});

describe('batch job store', () => {
  it('keeps one job per chat', () => {
    saveJob({ ...createJob('tag', 'a', [1, 2]), cursor: 1 });
    saveJob(createJob('tag', 'b', [5]));
    expect(loadJob('tag', 'a')?.cursor).toBe(1);
    expect(loadJob('tag', 'b')?.floors).toEqual([5]);
    clearJob('tag', 'a');
    expect(loadJob('tag', 'a')).toBeNull();
    expect(loadJob('tag', 'b')).not.toBeNull();
  });

  it('treats unreadable storage as no record instead of throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: () => {
        throw new Error('disabled');
      },
    });
    expect(() => saveJob(createJob('tag', 'a', [1]))).not.toThrow();
    expect(loadJob('tag', 'a')).toBeNull();
  });

  it('keeps tag and image jobs apart', () => {
    saveJob(createJob('tag', 'a', [1]));
    saveJob(createJob('image', 'a', [2, 3]));
    expect(loadJob('tag', 'a')?.floors).toEqual([1]);
    expect(loadJob('image', 'a')?.floors).toEqual([2, 3]);
  });

  it('reads records saved before jobs had a kind', () => {
    stored.set('bbi_batch_tag_jobs_v1', JSON.stringify({ a: { ...createJob('tag', 'a', [4]), kind: undefined } }));
    expect(loadJob('tag', 'a')?.kind).toBe('tag');
  });

  it('ignores corrupt data', () => {
    stored.set('bbi_batch_tag_jobs_v1', '{not json');
    expect(loadJob('tag', 'a')).toBeNull();
  });
});
