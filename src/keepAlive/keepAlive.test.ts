import { describe, expect, it } from 'vitest';

import { keepAlivePrefs, keepAliveState, keepAwake, quietWav, withKeepAwake } from './keepAlive';

describe('后台保活:有请求在跑才算', () => {
  it('结束函数调几次都只减一次', () => {
    const before = keepAliveState.users;
    const done = keepAwake();
    expect(keepAliveState.users).toBe(before + 1);
    done();
    done();
    expect(keepAliveState.users).toBe(before);
  });
  it('请求出错也会结束', async () => {
    const before = keepAliveState.users;
    await expect(
      withKeepAwake(async () => {
        expect(keepAliveState.users).toBe(before + 1);
        throw new Error('炸了');
      }),
    ).rejects.toThrow('炸了');
    expect(keepAliveState.users).toBe(before);
  });
  it('关掉开关时不计数', () => {
    keepAlivePrefs.on = false;
    const before = keepAliveState.users;
    const done = keepAwake();
    expect(keepAliveState.users).toBe(before);
    done();
    keepAlivePrefs.on = true;
  });
  it('音频文件是 2 秒 8kHz 16 位的 WAV', () => {
    expect(quietWav().size).toBe(44 + 16000 * 2);
  });
});
