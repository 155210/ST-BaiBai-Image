import { describe, expect, it } from 'vitest';

import { buildSlotTaskNote } from '@/autoTag/slotPlan';

import { MAX_REWRITE_HINT, normalizeRewriteHint, withRewriteHint } from './hint';

describe('normalizeRewriteHint', () => {
  it('去首尾空白、折叠多余空行', () => {
    expect(normalizeRewriteHint('  加上下雨的背景\r\n\r\n\r\n换成全身构图  ')).toBe(
      '加上下雨的背景\n\n换成全身构图',
    );
  });

  it('空白、null、undefined 都算没有要求', () => {
    expect(normalizeRewriteHint('   \n ')).toBe('');
    expect(normalizeRewriteHint(null)).toBe('');
    expect(normalizeRewriteHint(undefined)).toBe('');
  });

  it('超长截断', () => {
    expect(normalizeRewriteHint('雨'.repeat(MAX_REWRITE_HINT + 50))).toHaveLength(MAX_REWRITE_HINT);
  });
});

describe('withRewriteHint', () => {
  const note = buildSlotTaskNote('<bbi_image><tag>1girl, classroom</tag></bbi_image>', 0);

  it('留空时与上游的任务备注逐字一致', () => {
    expect(withRewriteHint(note, '')).toBe(note);
    expect(withRewriteHint(note, '  ')).toBe(note);
    expect(withRewriteHint(note, undefined)).toBe(note);
  });

  it('要求接在任务备注之后,并说明冲突时以它为准', () => {
    const out = withRewriteHint(note, ' 换成全身构图 ');
    expect(out.startsWith(note)).toBe(true);
    expect(out).toContain('【用户对这次重写的额外要求（优先级最高）】\n换成全身构图\n');
    expect(out).toContain('以这条要求为准');
    // 原锚点(当前提示词)还在:没提到的部分仍按原画面写
    expect(out).toContain('1girl, classroom');
  });

  it('任务备注为空时不留前导空行', () => {
    expect(withRewriteHint('', '加上下雨的背景').startsWith('【')).toBe(true);
  });
});
