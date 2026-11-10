<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import ModalMask from '@/components/ModalMask.vue';

import type { SlotItem } from './floorMultiRewrite';
import { MAX_REWRITE_HINT } from './hint';
import { combineSlotEdits, type SlotEdit } from './multiRewrite';

/**
 * 「一起改这层的图」弹窗(floorMultiRewrite.ts 命令式挂载,纪律同 PromptEditor:状态走 props/emit)。
 * 每张一张大图 + 一个输入框,写了要求的才改,留空的不动;底下「每张都要改」写了就每张都改。
 */
const props = defineProps<{
  floor: number;
  items: SlotItem[];
  configured: boolean;
  closing?: boolean;
}>();

const emit = defineEmits<{
  /** noNl:每张(按 items 顺序)出图时发不发自然语言 */
  (e: 'submit', edits: SlotEdit[], noNl: boolean[]): void;
  (e: 'close'): void;
}>();

const open = ref(false);
const hints = ref<string[]>(props.items.map(() => ''));
const common = ref('');
const noNl = ref<boolean[]>(props.items.map(item => item.noNl));
const filled = computed(() => combineSlotEdits(props.items.map((item, i) => ({ seq: item.seq, hint: hints.value[i] ?? '' })), common.value));

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
    <div class="bbi-modal" role="dialog" aria-modal="true" aria-label="一起改这层的图">
      <header class="bbi-modal-head">
        <span class="bbi-modal-title">一起改这层的图（第 {{ floor }} 楼）</span>
      </header>
      <p class="bbi-multi-rewrite__tip">给要改的那几张写修改要求，留空的不动；每张都要改的写在最下面。几张一起只问一次 AI，改完一起重新出图，旧图留在卡片历史里。</p>
      <ul class="bbi-multi-rewrite__list">
        <li v-for="(item, i) in items" :key="item.seq" class="bbi-multi-rewrite__item">
          <span class="bbi-multi-rewrite__no">第 {{ item.seq + 1 }} 张</span>
          <img v-if="item.src" class="bbi-multi-rewrite__img" :src="item.src" :alt="`第 ${item.seq + 1} 张`" loading="lazy" />
          <span v-else class="bbi-multi-rewrite__noimg">这张还没出图</span>
          <BbiTextarea
            v-model="hints[i]"
            :rows="1"
            :max-rows="4"
            :maxlength="MAX_REWRITE_HINT"
            placeholder="这张怎么改（留空不改），比如：换成全身构图"
          />
          <label class="bbi-multi-rewrite__nonl">
            <input v-model="noNl[i]" type="checkbox" class="bbi-checkbox" />
            出图不发自然语言（只发 tag）
          </label>
        </li>
      </ul>
      <label class="bbi-multi-rewrite__common">
        <span class="bbi-modal-label">每张都要改的（可留空）</span>
        <BbiTextarea
          v-model="common"
          :rows="1"
          :max-rows="3"
          :maxlength="MAX_REWRITE_HINT"
          enterkeyhint="done"
          placeholder="写了就每张都改，比如：都换成夜晚、加上下雨"
        />
      </label>
      <footer class="bbi-modal-foot">
        <span class="bbi-multi-rewrite__spacer"></span>
        <button class="bbi-btn" type="button" @click="emit('close')">取消</button>
        <button
          class="bbi-btn bbi-btn-primary"
          type="button"
          :disabled="!filled.length || !configured"
          :title="configured ? '' : '请先在柏宝绘「渠道」页完成配置'"
          @click="emit('submit', filled, [...noNl])"
        >
          一起改{{ filled.length ? ` ${filled.length} 张` : '' }}
        </button>
      </footer>
    </div>
  </ModalMask>
</template>

<style scoped>
.bbi-multi-rewrite__nonl {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  opacity: 0.85;
}

.bbi-multi-rewrite__tip {
  margin: 0;
  font-size: 12.5px;
  opacity: 0.8;
}

.bbi-multi-rewrite__list {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bbi-multi-rewrite__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 6px;
}

.bbi-multi-rewrite__img {
  display: block;
  width: 100%;
  max-height: 60vh;
  border-radius: 4px;
  object-fit: contain;
  background: color-mix(in srgb, currentColor 6%, transparent);
}

.bbi-multi-rewrite__noimg {
  padding: 16px 0;
  font-size: 12.5px;
  text-align: center;
  opacity: 0.6;
}

.bbi-multi-rewrite__no {
  font-size: 13px;
  font-weight: 600;
}

.bbi-multi-rewrite__common {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 4px;
}

.bbi-multi-rewrite__spacer {
  flex: 1 1 auto;
}
</style>
