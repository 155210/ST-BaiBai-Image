import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 本分支接入点检查:读 FORK_CHANGES.md 的「接入点」表,逐行确认文件里还有那段标记。
 * 合并原作者更新时冲掉了哪处,这里就报红。
 */

const root = new URL('../', import.meta.url);
const doc = readFileSync(new URL('FORK_CHANGES.md', root), 'utf8');

function touchpoints(): { file: string; marker: string; line: string }[] {
  const section = doc.split('## 接入点')[1]?.split('\n## ')[0] ?? '';
  return section
    .split('\n')
    .filter(line => line.startsWith('|') && !/^\|\s*(文件|---)/.test(line))
    .map(line => {
      const cells = line.split('|').map(cell => cell.trim());
      return { file: cells[1] ?? '', marker: cells[2] ?? '', line };
    });
}

describe('FORK_CHANGES.md 接入点都还在', () => {
  const rows = touchpoints();

  it('清单不是空的', () => {
    expect(rows.length).toBeGreaterThan(10);
  });

  for (const row of rows) {
    it(`${row.file}:${row.marker}`, () => {
      const url = new URL(row.file, root);
      expect(existsSync(url), `文件不见了:${row.line}`).toBe(true);
      expect(readFileSync(url, 'utf8').includes(row.marker), `接入点丢了:${row.line}`).toBe(true);
    });
  }
});
