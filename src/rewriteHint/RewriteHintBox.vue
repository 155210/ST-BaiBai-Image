<script setup lang="ts">
import BbiTextarea from '@/components/BbiTextarea.vue';

import { MAX_REWRITE_HINT } from './hint';

/**
 * 「AI 重写提示词」按钮上方的附加要求输入框(本 fork 独有,见 hint.ts)。
 * 只管输入;内容由 PromptEditor 随 emit('rewrite', hint) 交给调用方。
 */
defineProps<{
  modelValue: string;
  /** 重写在途 / 写回中 / 未配置渠道时只读:要求已经发出去了,改了也不生效。 */
  disabled?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();
</script>

<template>
  <div class="bbi-rewrite-hint">
    <span class="bbi-modal-label">给 AI 的重写要求(可留空)</span>
    <BbiTextarea
      class="bbi-rewrite-hint__input"
      :model-value="modelValue"
      :rows="1"
      :max-rows="4"
      :maxlength="MAX_REWRITE_HINT"
      :disabled="disabled"
      enterkeyhint="done"
      placeholder="比如：加上下雨的背景、换成全身构图"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.bbi-rewrite-hint {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.bbi-rewrite-hint__input {
  width: 100%;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.6;
}
</style>
