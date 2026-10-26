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
| src/floor/Lightbox.vue | import { useViewportFit } from '@/viewportFit/fit'; | 大图贴合手机实际屏幕，底下不露黑、顶上不被挡 | 大图黑屏一截 |
| src/floor/Lightbox.vue | useViewportFit(lightboxEl); | 同上 | 大图黑屏一截 |
| src/floor/Lightbox.vue | ref="lightboxEl" class="bbi-lightbox" | 同上：给遮罩挂 ref | 大图黑屏一截 |
| src/App.vue | import { useViewportFit } from '@/viewportFit/fit'; | 插件主面板也贴合手机实际屏幕，底下不露空 | 主面板底下空一截 |
| src/App.vue | useViewportFit(overlayEl); | 同上 | 主面板底下空一截 |
| src/App.vue | ref="overlayEl" | 同上：给遮罩挂 ref | 主面板底下空一截 |
| src/floor/lightbox.ts | nav: options.nav, | 同上：传给灯箱 | 图片浏览左右切换 |
| src/floor/lightbox.ts | export function closeLightbox | 切到没图的卡片时关掉灯箱 | 图片浏览左右切换 |
| src/floor/Lightbox.vue | import ImageContextView from '@/imageContext/ImageContext.vue'; | 大图下面、提示词上面显示这张图前面的几段正文 | 大图对照正文 |
| src/floor/Lightbox.vue | import type { ImageContextText } from '@/imageContext/before'; | 同上 | 大图对照正文 |
| src/floor/Lightbox.vue | context?: ImageContextText | 同上：灯箱接收正文 | 大图对照正文 |
| src/floor/Lightbox.vue | <ImageContextView v-if="context" :context="context" /> | 同上：放在提示词上面 | 大图对照正文 |
| src/floor/lightbox.ts | import type { ImageContextText } from '@/imageContext/before'; | 同上 | 大图对照正文 |
| src/floor/lightbox.ts | context: options.context, | 同上：传给灯箱 | 大图对照正文 |
| src/state/charTags.ts | 'bust', // fork:罩杯 | 角色库加「胸部（罩杯）」字段，跟在体型后面拼进 tag；旧数据读进来补成空 | 角色库罩杯 |
| src/state/charTags.ts | bust: '胸部', // fork:罩杯 | 同上：字段名 | 角色库罩杯 |
| src/state/charTags.ts | body: '', bust: '', extra: '' | 同上：空字段 | 角色库罩杯 |
| src/autoTag/protocol.ts | 'bust', // fork:罩杯 | 同上：AI 报的变化认这个字段 | 角色库罩杯 |
| src/autoTag/prompt.ts | 女性角色 bust 必填一个胸部大小 tag | 同上：建档时女性必须写胸部大小 | 角色库罩杯 |
| src/autoTag/prompt.ts | field 只能是 sex/hair/eyes/skin/body/bust/extra/outfit/fandom。 | 同上 | 角色库罩杯 |
| src/autoTag/charAnchors.ts | - bust(胸部,女性才填) | 同上：中文外貌转字段时拆出胸部 | 角色库罩杯 |
| src/autoTag/charAnchors.ts | "bust":"..." | 同上 | 角色库罩杯 |
| src/pages/characters/index.vue | bust: '女性填: flat chest | 同上：输入框提示 | 角色库罩杯 |
| src/state/charTags.ts | import { splitBust, withSplitBust } from '@/charBust/split'; | 旧角色「体型」里的胸部词读出来时挪到「胸部」 | 角色库罩杯 |
| src/state/charTags.ts | return splitBust(fields); | 同上：读库时 | 角色库罩杯 |
| src/state/charTags.ts | return entries.map(withSplitBust); | 同上：AI 改过体型之后 | 角色库罩杯 |
| src/autoTag/prompt.ts | 库中没标 [locked] 的女性角色「胸部」一栏为空时 | 同上：胸部还空着的旧角色让 AI 出场时补上 | 角色库罩杯 |
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
| src/autoTag/runner.ts | // fork:直接用重型预设 | 设置里开了「直接用重型提示词」时第一次就发重型 | 直接用重型预设 |
| src/pages/settings/index.vue | <HeavyPresetPanel /> | 设置页挂「重型自定义提示词」面板 | #7 |
| src/autoTag/prompt.test.ts | heavyPreset: heavyPresetDefaults(), | 测试夹具补新字段 | #7 |
| src/api/client.ts | import { beginStream } from '@/stream/live' | 流式实时输出 | #8 |
| src/api/client.ts | import { withIdleTimeout } from '@/stream/idle' | 流式按多少秒没有新内容计超时 | #8 |
| src/api/client.ts | floor?: number; | 请求带上楼层，楼层实时折叠区定位用 | #8 |
| src/api/client.ts | 只有真出了字才算「有新内容」 | readSseContent 回调片段；末尾无换行的行也解析 | #8 |
| src/autoTag/runner.ts | floor, // fork:流式时楼层上的实时折叠区 | 写 tag 请求带楼层 | #8 |
| src/index.ts | bindFloorStreamPanels(); // fork:楼层上的流式实时折叠区 | 绑定楼层实时折叠区 | #8 |
| src/floor/PromptEditor.vue | <StreamView v-if="rewriting" /> | 重写时看实时输出 | #8 |
| src/pages/batch/index.vue | <StreamView /> | 批量页实时输出 | #8 |
| src/pages/settings/index.vue | 开了之后，正在写 tag 的楼层下面 | 流式说明 | #8 |
| src/floor/promptEditor.ts | options.regenerate && consumeAutoGenerate( | 图片浏览里 AI 重写完自己出图（楼层不在页面上时没有卡片认领标记） | #15 |
| src/floor/promptEditor.ts | setPassageFloor(options.at.messageId); | 提示词弹窗告诉「挑正文里的一段」是哪一楼 | 挑段落生图 |
| src/autoTag/runner.ts | import { focusImageCount, passageTaskNote, regenImageOptions } from '@/rewriteHint/passage'; | 引入「挑一段生图」任务备注与张数 | 挑一段生图 |
| src/autoTag/runner.ts | count?: number; | 运行选项：重新生成时用户定的最多几张 | 重新生成可选段落 |
| src/autoTag/runner.ts | import { commitFocusSources, rememberFocusSources } from '@/rewriteHint/sources'; | 引入「记下每张图按哪几段出的」 | 记段落 |
| src/autoTag/runner.ts | // fork:记下每张图按哪几段出的 | 同上：钉位置后先记段落原文 | 记段落 |
| src/autoTag/runner.ts | // fork:段落记录随这次写回存盘 | 同上：写回时落到消息 extra | 记段落 |
| src/autoTag/runner.ts | import { manySlotTaskNote, normalizeSlotEdits, replaceManySlots, slotSeqs, type SlotEdit } from '@/rewriteHint/multiRewrite'; | 引入「一起改几张」 | 一起改几张 |
| src/autoTag/runner.ts | import { withSlotPositions } from '@/rewriteHint/slotPosition'; | 重写提示词时报上每张图的位置 | 重写报位置 |
| src/autoTag/runner.ts | // fork:报上图的位置 | 同上：接在单张 / 一起改的任务备注后面 | 重写报位置 |
| src/autoTag/runner.ts | /** fork:一起改几张 */ many?: SlotEdit[] | 同上：单槽选项带上几张各自的要求 | 一起改几张 |
| src/autoTag/runner.ts | const focusCount = slot ? (slot.many?.length ?? 1) | 同上：协议恰好返回几张 | 一起改几张 |
| src/autoTag/runner.ts | slot.many ? manySlotTaskNote(rawSource, slot.many) | 同上：任务备注 | 一起改几张 |
| src/autoTag/runner.ts | // fork:一起改几张都要重出 | 同上：几张都挂出图标记 | 一起改几张 |
| src/autoTag/runner.ts | // fork:一起改几张 | 同上：写回原位替换几张 | 一起改几张 |
| src/autoTag/runner.ts | // fork:撤掉这几张的标记 | 同上：失败收尾 | 一起改几张 |
| src/autoTag/runner.ts | // fork:异常时撤这几张 | 同上：异常收尾 | 一起改几张 |
| src/autoTag/runner.ts | export async function requestManySlotTags( | 同上：入口 | 一起改几张 |
| src/autoTag/runner.ts | // fork:重新生成时用户定的张数上限 | 同上：覆盖设置里的上限 | 重新生成可选段落 |
| src/autoTag/runner.ts | export async function requestRegenTags( | 同上：入口（指定段落或最多几张） | 重新生成可选段落 |
| src/floor/actionButton.ts | import { requestFloorTags, requestRegenTags } from '@/autoTag/runner'; | 同上：引入入口 | 重新生成可选段落 |
| src/floor/actionButton.ts | import { chooseRegen } from '@/rewriteHint/floorPassageGen'; | 同上：引入弹窗 | 重新生成可选段落 |
| src/floor/actionButton.ts | // fork:重新生成可以指定段落或定最多几张 | 同上：原来的确认窗换成选择弹窗 | 重新生成可选段落 |
| src/autoTag/runner.ts | // fork:挑段落几组就几张 | 一次挑几组段落、每组一张，只调一次 AI | 一次挑几组 |
| src/autoTag/runner.ts | focus?: string; | 运行选项：只为用户点选的段落画 1 张 | 挑一段生图 |
| src/autoTag/runner.ts | // fork:挑一段生图同样恰好 1 张 | 同上：恰好 1 张 | 挑一段生图 |
| src/autoTag/runner.ts | opts.focus ? passageTaskNote(opts.focus) : '' | 同上：任务备注 | 挑一段生图 |
| src/autoTag/runner.ts | !!opts.focus); | 同上：写完直接出图 | 挑一段生图 |
| src/autoTag/runner.ts | opts.focus ? 'force' : undefined | 同上：出图标记用 force | 挑一段生图 |
| src/autoTag/runner.ts | export async function requestFocusedTags | 同上：入口 | 挑一段生图 |
| src/index.ts | bindPassageGenButtons(); | 楼层上的「挑一段生图」按钮 | 挑一段生图 |
| src/autoTag/runner.ts | import { pinFocusPosition, placeSlotTag, slotExtraUpdate } from '@/rewriteHint/move'; | 引入「挑段落后图挪到那段后面」 | 挑段落挪位置 |
| src/autoTag/runner.ts | if (opts.focus) pinFocusPosition(plan.images, preparedTarget.segments, opts.focus); | 挑一段生图：图钉到所选段落后 | 挑段落挪位置 |
| src/autoTag/runner.ts | return placeSlotTag(currentText, { chatId, floor, swipeId: markSwipeId, seq: slot.seq }, serializeImageTag(plan.images[0]), slot.hint); | 单槽重写挑了段落就把 tag 挪到那段后面 | 挑段落挪位置 |
| src/autoTag/runner.ts | ? slotExtraUpdate(floor) | 挪位置时图片记录的序号同一次写回重排 | 挑段落挪位置 |
| src/floor/promptEditor.ts | followMovedSlot(options.at); | 提示词弹窗跟到挪过的新序号 | 挑段落挪位置 |
| src/floor/promptEditor.ts | options.regenerate(options.at.seq); | 图片浏览按新序号出图 | 挑段落挪位置 |
| src/state/settings.ts | freeOnly: boolean; | NAI「只用免费额度」设置字段 | 官方额度与 Anlas |
| src/state/settings.ts | freeOnly: false, // fork:只用免费额度 | 同上：默认关 | 官方额度与 Anlas |
| src/state/settings.ts | freeOnly: o.freeOnly === true, // fork:只用免费额度 | 同上：读设置 | 官方额度与 Anlas |
| src/backends/nai.ts | import { assertNaiFreeAllowed } from '@/naiQuota/quota'; | 引入出图前额度检查 | 官方额度与 Anlas |
| src/backends/nai.ts | await assertNaiFreeAllowed(nai, params); | 会扣 Anlas 的图在发请求前拦下 | 官方额度与 Anlas |
| src/pages/backend/panels/NaiPanel.vue | import NaiQuotaSection from '@/naiQuota/NaiQuotaSection.vue'; | NAI 页引入额度区块 | 官方额度与 Anlas |
| src/pages/backend/panels/NaiPanel.vue | <NaiQuotaSection /> | NAI 页显示订阅、Anlas、每张费用和开关 | 官方额度与 Anlas |
| src/st/messageEdit.ts | import { deferWhileGenerating } from '@/streamSafe/deferWhileGenerating'; | 引入「出字时推迟通知」 | 流式卡住 |
| src/st/messageEdit.ts | // fork:流式输出期间推迟通知 | 写完 tag 时酒馆正在出字：事件等输出完再发，免得别的插件重绘聊天把流式卡住 | 流式卡住 |
| src/st/messageEdit.ts | // fork:流式输出期间不整段重载 | 同上：本楼刷新失败时也不在出字途中整段重载聊天 | 流式卡住 |
| src/autoTag/runner.ts | import { addFocusedTags, dropAddedMark, waitFloorIdle } from '@/rewriteHint/move'; | 引入「再加一张」 | 再加一张 |
| src/autoTag/runner.ts | add?: boolean; | 运行选项：已有图的楼再加一张 | 再加一张 |
| src/autoTag/runner.ts | && !opts.add) { | 同上：已有 tag 也放行 | 再加一张 |
| src/autoTag/runner.ts | opts.add ? stripImageTags(rawSource) | 同上：分析去掉旧 tag 的正文 | 再加一张 |
| src/autoTag/runner.ts | opts.add ? charTagsBeforeFloor(floor + 1) | 同上：角色库含本楼已建档 | 再加一张 |
| src/autoTag/runner.ts | opts.add ? [] : planChangeOps(plan); | 同上：不改本楼角色记录 | 再加一张 |
| src/autoTag/runner.ts | !opts.quiet && !opts.add && | 同上：不给原有图挂出图标记 | 再加一张 |
| src/autoTag/runner.ts | // fork:加图等本楼正在出的图收尾再插 | 同上：等在出的图收尾 | 再加一张 |
| src/autoTag/runner.ts | // fork:再加几张 | 同上：新 tag 各插到所选那组段落后 | 再加一张 |
| src/autoTag/runner.ts | // fork:加图同样走图片记录重排 | 同上：后面那些图的序号一起 +1 | 再加一张 |
| src/autoTag/runner.ts | // fork:加图没写成就撤掉它的出图标记 | 同上：失败收尾 | 再加一张 |
| src/autoTag/runner.ts | // fork:加图只撤自己那枚 | 同上：异常收尾 | 再加一张 |
| src/autoTag/runner.ts | focus: hint, add }); | 同上：入口带 add | 再加一张 |
| src/floor/Card.vue | import { hasSlotVersions, openSlotVersions } from '@/promptVersions/restore'; | 卡片「⋯」里的「提示词历史」按钮 | 提示词历史 |
| src/floor/Card.vue | title="提示词历史（换回改之前的）" | 同上：按钮本身 | 提示词历史 |
| src/floor/promptEditor.ts | import { rememberPrompt } from '@/promptVersions/restore'; | 改提示词时记下没出过图的旧提示词 | 提示词历史 |
| src/floor/promptEditor.ts | rememberPrompt(message, at.swipeId, at.seq, at.rawTag), | 同上：和正文一起落盘 | 提示词历史 |
| src/floor/PromptEditor.vue | import PromptOnlyEdit from '@/promptOnlyEdit/PromptOnlyEdit.vue'; | 编辑提示词里的「只改提示词（不发正文）」 | 只改提示词 |
| src/floor/PromptEditor.vue | @result="fillDraft" | 同上：结果填进输入框 | 只改提示词 |
| src/floor/PromptEditor.vue | function fillDraft(next: ImageTagContent) | 同上 | 只改提示词 |

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
- `src/charBust/`：角色库「胸部」一栏的旧数据迁移（体型里的胸部词挪过去）
- `src/floorMenu/`：楼层「⋯」里柏宝绘的几个按钮收成一个 🎧，点开竖排菜单（原按钮照常注入，只是藏起来）
- `src/imageContext/`：图片浏览的大图下面、提示词上面显示这张图前面的几段正文，方便对照图和文字
- `src/promptVersions/`：一张图用过的提示词（出过图的从图片记录里找，没出过图就被改掉的记在消息 extra 的 bbiPromptMemo），点「换回这版」把提示词写回正文，那版的图跟着回来
- `src/promptOnlyEdit/`：编辑提示词里的「只改提示词（不发正文）」，只把现在的提示词和要求发给 AI，改好填进输入框，用户自己点应用
- `src/viewportFit/`：插件主面板和大图（聊天里的和图片浏览里的）按手机实际可见屏幕摆位置和高度，地址栏伸缩后底下不露黑屏、顶上按钮不被状态栏挡
- `src/naiQuota/`：NAI 官方订阅额度与 Anlas 显示、每张费用估算、「只用免费额度」开关（批量遇到会直接暂停）
- `src/rewriteHint/`：AI 重写提示词时可以写额外要求；「挑正文里的一段」点选本楼段落只画那几段；楼层「⋯」里有「挑一段生图」按钮（可一次挑几组段落、每组一张，只调一次 AI；已有图的楼是「再加图」，新图插到所选段落后、原来的图不动）；楼层「重新生成 tag」可以不指定段落并定最多几张，或指定段落几组几张；按段落出的图会记下是哪几段（消息 extra 的 bbiPassageSources），再加图时标在那几段上；没写成时再打开会带上上次选的段落；选了没生成就自动存着，下次打开接着选，点「清空」才清掉（pickDraft.ts，存在浏览器里、按段落原文找回）；有图的楼「⋯」里还有「一起改这层的图」，每张写修改要求、一次发给 AI 一起改；重写提示词时把每张图在正文里的位置一并报给 AI（slotPosition.ts），免得它自己推算
- `src/autoTag/heavyPreset.ts`、`src/pages/settings/HeavyPresetPanel.vue`：解析失败时改用酒馆预设（重型自定义提示词），也可以设成一开始就直接用
- `src/stream/`：副 API 流式实时输出（往上翻看时定住、可复制全文、能中断这次写 tag；显示全文、新内容只追加；楼层上的折叠区写完后留着，不分哪一楼只留最近两次）、无响应超时
- `src/streamSafe/`：酒馆正在流式出字时，写完 tag 的楼层更新通知先排队，输出完再补发
- `src/fork.guard.test.ts`、本文件

## 合并原作者更新的步骤

1. `git fetch https://github.com/baibai-git/ST-BaiBai-Image main`，在新分支上合并。
2. 解冲突时以原作者的新代码为准，再把上表的接入点补回去。
3. `pnpm test`（含本清单的检查）、`pnpm exec vue-tsc --noEmit -p tsconfig.check.json`、`pnpm build`。
4. 改版本号，提 PR。
