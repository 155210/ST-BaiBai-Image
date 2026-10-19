import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 合并上游的护栏:「AI 重写要求」的逻辑在 rewriteHint/ 里,上游文件只留几行钩子。
 * 合并时如果冲突被「全用上游的」一刀切掉,功能会**静默失效**(输入框还在、要求却没发出去,
 * 或者输入框整个消失)——类型检查不一定报错(hint 都是可选参数)。这里逐个钉住钩子,
 * 丢了哪个就红哪个,报错信息直接说该补回什么。
 */
function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/** 去掉空白再比,上游格式化(换行/缩进)变了不误报。 */
function squash(text: string): string {
  return text.replace(/\s+/g, '');
}

function expectHook(path: string, snippet: string, what: string): void {
  expect(squash(source(path)), `${path} 丢了钩子:${what}\n应包含:${snippet}`).toContain(
    squash(snippet),
  );
}

describe('AI 重写要求:上游文件里的钩子', () => {
  it('PromptEditor.vue:引入并放上输入框', () => {
    expectHook(
      'floor/PromptEditor.vue',
      "import RewriteHintBox from '@/rewriteHint/RewriteHintBox.vue';",
      '引入输入框组件',
    );
    expectHook('floor/PromptEditor.vue', "const rewriteHint = ref('');", '输入框的状态');
    expectHook(
      'floor/PromptEditor.vue',
      '<RewriteHintBox v-model="rewriteHint"',
      '「AI 重写提示词」按钮上方的输入框',
    );
  });

  it('PromptEditor.vue:点重写时把要求发出去', () => {
    expectHook('floor/PromptEditor.vue', "(e: 'rewrite', hint: string): void;", 'emit 签名带 hint');
    expectHook('floor/PromptEditor.vue', "emit('rewrite', rewriteHint.value);", '重写时带上要求');
  });

  it('promptEditor.ts:要求一路传到 requestSlotTag', () => {
    expectHook('floor/promptEditor.ts', "const rewrite = (hint = ''): void =>", 'rewrite 接收 hint');
    expectHook('floor/promptEditor.ts', 'startRewrite(hint);', '无确认 / 确认后都把 hint 交给 startRewrite');
    expect(squash(source('floor/promptEditor.ts')).split(squash('startRewrite(hint);')).length - 1).toBe(2);
    expectHook('floor/promptEditor.ts', "const startRewrite = (hint = ''): void =>", 'startRewrite 接收 hint');
    expectHook(
      'floor/promptEditor.ts',
      'requestSlotTag(options.at.messageId, options.at.seq, hint)',
      '把 hint 交给 runner',
    );
  });

  it('runner.ts:要求拼进发给 AI 的任务备注', () => {
    expectHook('autoTag/runner.ts', "import { withRewriteHint } from '@/rewriteHint/hint';", '引入拼接函数');
    expectHook(
      'autoTag/runner.ts',
      "export async function requestSlotTag(floor: number, seq: number, hint = ''): Promise<void>",
      'requestSlotTag 接收 hint',
    );
    expectHook('autoTag/runner.ts', 'slot: { seq, hint }', 'hint 放进 slot 选项');
    expectHook('autoTag/runner.ts', 'hint?: string', 'RunOptions.slot 带 hint 字段');
    expectHook(
      'autoTag/runner.ts',
      'withRewriteHint(buildSlotTaskNote(rawSource, slot.seq), slot.hint)',
      '任务备注后面接上要求',
    );
  });
});
