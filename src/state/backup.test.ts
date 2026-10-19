import { describe, expect, it } from 'vitest';

import { BACKUP_FORMAT, parseBackup, stripKeys } from '@/state/backup';

describe('parseBackup', () => {
  it('accepts an exported file and fills defaults', () => {
    const backup = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { enabled: true } }));
    expect(backup.settings).toEqual({ enabled: true });
    expect(backup.globalCharacters).toEqual([]);
    expect(backup.vibes).toEqual({});
    expect(backup.withKeys).toBe(true);
  });

  it('rejects other files with a readable message', () => {
    expect(() => parseBackup('not json')).toThrow('不是 JSON');
    expect(() => parseBackup('{"a":1}')).toThrow('不是柏宝绘导出的设置');
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, settings: {} }))).toThrow('更新插件');
  });
});

describe('stripKeys', () => {
  it('clears every API key', () => {
    const raw = {
      nai: { key: 'a', endpoints: [{ id: 'x', key: 'b' }] },
      channels: [{ id: 'c', key: 'd' }],
    };
    stripKeys(raw);
    expect(raw).toEqual({ nai: { key: '', endpoints: [{ id: 'x', key: '' }] }, channels: [{ id: 'c', key: '' }] });
  });
});
