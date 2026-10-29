<script setup lang="ts">
import { ref } from 'vue';

import { setSlotNoNl, slotNoNl, type SlotRef } from './perSlot';

/**
 * 聊天楼层卡片「⋯」里的「出图不发自然语言」开关(本 fork 独有,见 perSlot.ts)。
 * 卡片活在自己的 shadow root 里,那里没有插件的 index.css,所以只用卡片已有的 bbi-fab 样式 + 行内样式。
 */
const props = defineProps<{ at: SlotRef }>();
const emit = defineEmits<{ (e: 'done'): void }>();

const on = ref(slotNoNl(props.at));

function toggle(): void {
  on.value = !on.value;
  setSlotNoNl(props.at, on.value);
  toastr.info(on.value ? '这张以后出图只发 tag，不发自然语言' : '这张出图会照常发自然语言', '柏宝绘');
  emit('done');
}
</script>

<template>
  <button
    class="bbi-fab"
    :class="{ 'bbi-fab--on': on }"
    type="button"
    :title="on ? '出图不发自然语言（已开，点一下改回发）' : '出图不发自然语言'"
    :aria-pressed="on"
    @click="toggle"
  >
    <span style="font-size: 11px; font-weight: 700; line-height: 1" :style="on ? 'text-decoration: line-through' : ''">NL</span>
  </button>
</template>
