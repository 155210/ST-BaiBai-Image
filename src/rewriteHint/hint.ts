/**
 * 「AI 重写提示词」的附加要求(本 fork 独有,上游没有)。
 *
 * 【为什么单独一个目录】
 * 上游还在频繁改 PromptEditor / runner / slotPlan,本功能只在这些文件里留几行钩子,
 * 逻辑全放这里,合并上游时冲突面最小。钩子在哪、丢了怎么发现,见 hooks.test.ts。
 *
 * 用户在弹窗里写一句「加上下雨的背景」「换成全身构图」,随正文一起发给 AI。
 * 留空 = 与上游行为完全一致(withRewriteHint 原样返回 taskNote)。
 */

/** 附加要求的字数上限:这是一句话的要求,不是第二份提示词;过长截断免得淹没正文。 */
export const MAX_REWRITE_HINT = 500;

/** 归一:去首尾空白、折叠多余空行、截断。返回空串 = 没有附加要求。 */
export function normalizeRewriteHint(raw: string | null | undefined): string {
  const text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > MAX_REWRITE_HINT ? text.slice(0, MAX_REWRITE_HINT) : text;
}

/**
 * 把附加要求接到单槽重写的任务备注(slotPlan.buildSlotTaskNote 的结果)后面。
 *
 * 上游的任务备注明令「不要换构图主体」——而用户写「换成全身构图」恰恰就是要换,
 * 所以这里要明说:冲突时**以用户要求为准**,没提到的部分才照旧锚住原画面。
 */
export function withRewriteHint(taskNote: string, hint: string | null | undefined): string {
  const text = normalizeRewriteHint(hint);
  if (!text) return taskNote;
  const lines = [
    '【用户对这次重写的额外要求（优先级最高）】',
    text,
    '请按这条要求改写这一张的提示词。它与上面「不要另选画面、不要换构图」等约束冲突时，以这条要求为准；要求没提到的部分，照旧依据正文、保持原来的画面。',
  ];
  return taskNote ? `${taskNote}\n\n${lines.join('\n')}` : lines.join('\n');
}
