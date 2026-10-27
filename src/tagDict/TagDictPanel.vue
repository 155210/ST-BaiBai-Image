<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { settings } from '@/state/settings';
import { loadTagDict, tagDict } from '@/tagDict/load';
import { tagDictDefaults } from '@/tagDict/settings';

/** 设置 → 标签库:三个开关和词典读取情况 */
if (!settings.autoTag.tagDict) settings.autoTag.tagDict = tagDictDefaults();
const failed = ref(false);

onMounted(async () => {
  failed.value = !(await loadTagDict());
});
</script>

<template>
  <p class="bbi-field-hint">
    内置 4 万多个 Danbooru 标签和它们的中文名。
    <template v-if="tagDict">已读取 {{ tagDict.size }} 个标签。</template>
    <template v-else-if="failed">标签库数据没读到，下面的功能暂时不起作用。</template>
    <template v-else>正在读取…</template>
  </p>

  <label class="bbi-switch-row">
    <span class="bbi-field-label">写 tag 时给 AI 中英对照</span>
    <input v-model="settings.autoTag.tagDict.hint" type="checkbox" class="bbi-checkbox" />
  </label>
  <p class="bbi-field-hint">从正文里找出标签库认识的中文词（黑发、女仆装、初音未来…），把「黑发=black hair」这样的对照附给 AI，让它照标准写法写。</p>

  <label class="bbi-switch-row">
    <span class="bbi-field-label">AI 写完后纠正写法</span>
    <input v-model="settings.autoTag.tagDict.fix" type="checkbox" class="bbi-checkbox" />
  </label>
  <p class="bbi-field-hint">对照标签库改正写法（hires → highres、blue eye → blue eyes、下划线、大小写），重复的去掉。带权重、括号、@ 的不动。</p>

  <label class="bbi-switch-row">
    <span class="bbi-field-label">编辑提示词时联想标签</span>
    <input v-model="settings.autoTag.tagDict.suggest" type="checkbox" class="bbi-checkbox" />
  </label>
  <p class="bbi-field-hint">在「画面 tag」「负面提示词」里打中文（如「黑发」）或英文开头，下面列出候选，点一下换成英文标签。</p>
</template>
