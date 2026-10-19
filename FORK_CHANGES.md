# 本分支对原作者文件的改动清单

本仓库是 [baibai-git/ST-BaiBai-Image](https://github.com/baibai-git/ST-BaiBai-Image) 的维护分支。
新功能尽量放在本分支自己的文件里（见文末「本分支自有文件」），只在原作者的文件里留很少的接入点。
**每次合并原作者更新时，对照下面的表逐条确认还在。**

`src/fork.guard.test.ts` 会读下面「接入点」表：每一行要求「文件」里还能找到「标记」这段原文。
合并时冲掉了哪一处，`pnpm test` 就会报红并指出是哪一行。

新增接入点时：在表里加一行（标记选一段改名也不太会变的原文，不要含 `|` 或反引号），PR 号写在最后一列。

## 接入点

| 文件 | 标记 | 作用 | PR |
| --- | --- | --- | --- |
| src/update.ts | raw.githubusercontent.com/155210/ST-BaiBai-Image | 检查更新看本仓库 | #1 |
| manifest.json | "homePage": "https://github.com/155210/ST-BaiBai-Image" | 插件主页指向本仓库 | #1 |
| README.md | 本仓库是 [baibai-git/ST-BaiBai-Image] | 说明是维护分支、版本号规则 | #1 |
| src/autoTag/prompt.test.ts | nvwa_standalone_core | 年龄限定断言跳过默认破限核心 | #1 |
| src/pages/registry.ts | id: 'batch', label: '批量' | 批量页入口 | #2 |
| src/components/Icon.vue | batch: | 批量页图标 | #2 |
| src/autoTag/runner.ts | export type TagRunOutcome | 写 tag 的结局返回给批量计数 | #2 |
| src/autoTag/runner.ts | quiet?: boolean | 批量写 tag 不弹逐楼提示、不挂自动出图标记 | #2 |
| src/autoTag/runner.ts | opts: { replace?: boolean; quiet?: boolean } | requestFloorTags 带 quiet 并返回结局 | #2 |
| src/floor/Card.vue | import { generateSlot } from '@/floor/slotGenerate' | 卡片出图抽成与批量共用的函数 | #3 |
| src/floor/storage.ts | 出图期间切换了聊天或楼层有变动 | 出图途中换聊天/删楼时不写错楼 | #3 |
| src/floor/promptEditor.ts | selfRegenerate | 图片浏览里「应用并重绘」自己出图 | #4 |
| src/state/settings.ts | export function replaceSettings | 导入设置时整体替换 | #5 |
| src/state/globalCharTags.ts | export function replaceGlobalCharTags | 导入设置时替换全局角色库 | #5 |
| src/pages/settings/index.vue | import BackupSection from './BackupSection.vue' | 设置页挂「导出 / 导入设置」 | #5 |
| src/pages/settings/index.vue | <BackupSection /> | 同上 | #5 |
| src/floor/Lightbox.vue | import LightboxNavButtons from '@/lightboxNav/LightboxNav.vue'; | 灯箱左右切换箭头 | 图片浏览左右切换 |
| src/floor/Lightbox.vue | nav?: LightboxNav; | 同上：灯箱接收切换回调 | 图片浏览左右切换 |
| src/floor/Lightbox.vue | <LightboxNavButtons v-if="nav" :nav="nav" /> | 同上：放箭头 | 图片浏览左右切换 |
| src/floor/lightbox.ts | nav: options.nav, | 同上：传给灯箱 | 图片浏览左右切换 |
| src/floor/lightbox.ts | export function closeLightbox | 切到没图的卡片时关掉灯箱 | 图片浏览左右切换 |
| src/floor/PromptEditor.vue | import RewriteHintBox from '@/rewriteHint/RewriteHintBox.vue'; | 引入重写要求输入框 | #6 |
| src/floor/PromptEditor.vue | const rewriteHint = ref(''); | 重写要求的状态 | #6 |
| src/floor/PromptEditor.vue | <RewriteHintBox v-model="rewriteHint" | 「AI 重写提示词」按钮上方的输入框 | #6 |
| src/floor/PromptEditor.vue | (e: 'rewrite', hint: string): void; | rewrite 事件带上要求 | #6 |
| src/floor/PromptEditor.vue | emit('rewrite', rewriteHint.value); | 点重写时发出要求 | #6 |
| src/floor/promptEditor.ts | const rewrite = (hint = ''): void => | 弹窗回调接收要求 | #6 |
| src/floor/promptEditor.ts | const startRewrite = (hint = ''): void => | 确认后继续带着要求 | #6 |
| src/floor/promptEditor.ts | requestSlotTag(options.at.messageId, options.at.seq, hint) | 要求交给 runner | #6 |
| src/autoTag/runner.ts | import { withRewriteHint } from '@/rewriteHint/hint'; | 引入拼接函数 | #6 |
| src/autoTag/runner.ts | export async function requestSlotTag(floor: number, seq: number, hint = ''): Promise<void> | 单槽重写接收要求 | #6 |
| src/autoTag/runner.ts | slot: { seq, hint } | 要求放进 slot 选项 | #6 |
| src/autoTag/runner.ts | withRewriteHint(buildSlotTaskNote(rawSource, slot.seq), slot.hint) | 要求拼进发给 AI 的任务备注 | #6 |
| src/state/settings.ts | heavyPreset: normalizeHeavyPreset(rt.heavyPreset), | 重型自定义提示词设置字段、默认值与兜底 | #7 |
| src/autoTag/runner.ts | const attemptMessages = attemptHeavy ? heavy : messages; | 解析失败后剩余重试改发酒馆预设拼装的消息链 | #7 |
| src/pages/settings/index.vue | <HeavyPresetPanel /> | 设置页挂「重型自定义提示词」面板 | #7 |
| src/autoTag/prompt.test.ts | heavyPreset: heavyPresetDefaults(), | 测试夹具补新字段 | #7 |

## 其他本分支改动（不在原作者文件里，或合并时一定会冲突、手动处理）

- `package.json` / `manifest.json` 的版本号：前三位跟原作者，第四位是本分支修订号。合并后取原作者的前三位，第四位从 1 重新数。
- `dist/`：合并完一律 `pnpm build` 重新生成，不手动解冲突。
- `.github/workflows/ci.yml`、`tsconfig.check.json`：本分支加的自动检查。

## 本分支自有文件

- `src/batch/`：批量写 tag、批量出图、图片浏览、角色搜索的逻辑
- `src/pages/batch/`：批量页界面
- `src/floor/slotGenerate.ts`：单张出图（卡片与批量共用）
- `src/state/backup.ts`、`src/pages/settings/BackupSection.vue`：导出 / 导入设置
- `src/lightboxNav/`、`src/batch/galleryLightbox.ts`、`src/pages/batch/EmptySlotView.vue`：图片浏览大图左右切换
- `src/rewriteHint/`：AI 重写提示词时可以写额外要求
- `src/autoTag/heavyPreset.ts`、`src/pages/settings/HeavyPresetPanel.vue`：解析失败时改用酒馆预设（重型自定义提示词）
- `src/fork.guard.test.ts`、本文件

## 合并原作者更新的步骤

1. `git fetch https://github.com/baibai-git/ST-BaiBai-Image main`，在新分支上合并。
2. 解冲突时以原作者的新代码为准，再把上表的接入点补回去。
3. `pnpm test`（含本清单的检查）、`pnpm exec vue-tsc --noEmit -p tsconfig.check.json`、`pnpm build`。
4. 改版本号，提 PR。
