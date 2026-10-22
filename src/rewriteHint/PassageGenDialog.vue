<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import ModalMask from '@/components/ModalMask.vue';

import { MAX_REWRITE_HINT } from './hint';
import PassageList from './PassageList.vue';
import type { Passage } from './passage';

/**
 * 楼层「挑一段生图」/「再加一张图」弹窗(floorPassageGen.ts 命令式挂载,纪律同 PromptEditor:
 * 状态一律走 props/emit,不用 ref 拿实例)。
 */
const props = defineProps<{
  floor: number;
  passages: Passage[];
  configured: boolean;
  closing?: boolean;
  /** 本楼已有几张图;大于 0 就是「再加一张」 */
  existing?: number;
}>();

const emit = defineEmits<{
  (e: 'submit', ids: string[], extra: string): void;
  (e: 'close'): void;
}>();

const open = ref(false);
const picked = ref<string[]>([]);
const extra = ref('');

watch(
  () => props.closing,
  value => {
    if (value) open.value = false;
  },
);

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  emit('close');
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown, true);
  requestAnimationFrame(() => {
    open.value = true;
  });
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
});
</script>

<template>
  <ModalMask :open="open" top-layer @close="emit('close')">
    <div class="bbi-modal" role="dialog" aria-modal="true" aria-label="挑一段生图">
      <header class="bbi-modal-head">
        <span class="bbi-modal-title">{{ existing ? '再加一张图' : '挑一段生图' }}（第 {{ floor }} 楼）</span>
      </header>
      <p class="bbi-passage-gen__tip">
        点选要画的段落（可多选），AI 只按这几段写一张图的提示词，写完直接出图。
        <template v-if="existing">本楼已有 {{ existing }} 张图，新图会放在所选段落后面，原来的图不动。</template>
      </p>
      <PassageList v-model="picked" :passages="passages" />
      <label class="bbi-passage-gen__extra">
        <span class="bbi-modal-label">另外的要求(可留空)</span>
        <BbiTextarea
          v-model="extra"
          :rows="1"
          :max-rows="3"
          :maxlength="MAX_REWRITE_HINT"
          enterkeyhint="done"
          placeholder="比如：全身构图、加上下雨的背景"
        />
      </label>
      <footer class="bbi-modal-foot">
        <span class="bbi-passage-gen__spacer"></span>
        <button class="bbi-btn" type="button" @click="emit('close')">取消</button>
        <button
          class="bbi-btn bbi-btn-primary"
          type="button"
          :disabled="!picked.length || !configured"
          :title="configured ? '' : '请先在柏宝绘「渠道」页完成配置'"
          @click="emit('submit', picked, extra)"
        >
          {{ existing ? '加这一张' : '生成这一张' }}{{ picked.length ? `（${picked.length} 段）` : '' }}
        </button>
      </footer>
    </div>
  </ModalMask>
</template>

<style scoped>
.bbi-passage-gen__tip {
  margin: 0;
  font-size: 12.5px;
  opacity: 0.8;
}

.bbi-passage-gen__extra {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bbi-passage-gen__spacer {
  flex: 1 1 auto;
}
</style>
