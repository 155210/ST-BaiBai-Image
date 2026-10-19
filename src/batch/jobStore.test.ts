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
    saveJob({ ...createJob('a', [1, 2]), cursor: 1 });
    saveJob(createJob('b', [5]));
    expect(loadJob('a')?.cursor).toBe(1);
    expect(loadJob('b')?.floors).toEqual([5]);
    clearJob('a');
    expect(loadJob('a')).toBeNull();
    expect(loadJob('b')).not.toBeNull();
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
    expect(() => saveJob(createJob('a', [1]))).not.toThrow();
    expect(loadJob('a')).toBeNull();
  });

  it('ignores corrupt data', () => {
    stored.set('bbi_batch_tag_jobs_v1', '{not json');
    expect(loadJob('a')).toBeNull();
  });
});
