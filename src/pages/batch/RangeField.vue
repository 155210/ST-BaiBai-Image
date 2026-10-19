<script setup lang="ts">
import { computed } from 'vue';

import { parseFloorRange } from '@/batch/range';

/** 楼层范围输入框(批量生成、图片浏览各用一个)。 */

const props = defineProps<{
  modelValue: string;
  lastFloor: number;
  disabled?: boolean;
  /** 输入框下面多说一句(比如「跑的时候不能改」)。 */
  note?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const info = computed(() => {
  try {
    const floors = parseFloorRange(props.modelValue, props.lastFloor);
    return { text: `范围内 ${floors.length} 楼，最后一楼是 ${props.lastFloor}。`, error: false };
  } catch (error) {
    return { text: error instanceof Error ? error.message : String(error), error: true };
  }
});
</script>

<template>
  <div class="bbi-field bbi-floor-range">
    <span class="bbi-field-label">楼层范围</span>
    <div class="bbi-floor-range-row">
      <input
        :value="modelValue"
        class="bbi-input"
        type="text"
        inputmode="text"
        placeholder="留空 = 整个聊天；例：0-500, 800-"
        :disabled="disabled"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button class="bbi-btn bbi-btn-sm" type="button" :disabled="disabled" @click="emit('update:modelValue', '')">
        全部
      </button>
      <slot name="actions" />
    </div>
    <p class="bbi-field-hint" :class="{ 'bbi-floor-range-error': info.error }">
      {{ info.text }}楼号就是酒馆里显示的楼号。<template v-if="note">{{ note }}</template>
    </p>
  </div>
</template>

<style scoped>
.bbi-floor-range {
  /* 放在 .bbi-sections(纵向 flex)里,不许被压扁 */
  flex-shrink: 0;
  margin-bottom: 4px;
}
.bbi-floor-range-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.bbi-floor-range-row .bbi-input {
  flex: 1 1 auto;
  min-width: 0;
}
.bbi-floor-range-error {
  color: var(--bbi-danger);
}
</style>
