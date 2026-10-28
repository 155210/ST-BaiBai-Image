<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import ModalMask from '@/components/ModalMask.vue';

import type { SlotItem } from './floorMultiRewrite';
import { MAX_REWRITE_HINT } from './hint';
import type { SlotEdit } from './multiRewrite';

/**
 * 「一起改这层的图」弹窗(floorMultiRewrite.ts 命令式挂载,纪律同 PromptEditor:状态走 props/emit)。
 * 每张一个输入框,写了要求的才改,留空的不动。
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
const noNl = ref<boolean[]>(props.items.map(item => item.noNl));
const filled = computed(() => props.items.map((item, i) => ({ seq: item.seq, hint: hints.value[i] ?? '' })).filter(e => e.hint.trim()));

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
      <p class="bbi-multi-rewrite__tip">给要改的那几张写修改要求，留空的不动。几张一起只问一次 AI，改完一起重新出图，旧图留在卡片历史里。</p>
      <ul class="bbi-multi-rewrite__list">
        <li v-for="(item, i) in items" :key="item.seq" class="bbi-multi-rewrite__item">
          <div class="bbi-multi-rewrite__head">
            <img v-if="item.src" :src="item.src" alt="" loading="lazy" />
            <div class="bbi-multi-rewrite__meta">
              <span class="bbi-multi-rewrite__no">第 {{ item.seq + 1 }} 张</span>
              <span class="bbi-multi-rewrite__prompt">{{ item.prompt || '（没有提示词）' }}</span>
            </div>
          </div>
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

.bbi-multi-rewrite__head {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.bbi-multi-rewrite__head img {
  flex: 0 0 auto;
  width: 48px;
  height: 64px;
  border-radius: 4px;
  object-fit: cover;
}

.bbi-multi-rewrite__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bbi-multi-rewrite__no {
  font-size: 13px;
  font-weight: 600;
}

.bbi-multi-rewrite__prompt {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  font-size: 12px;
  opacity: 0.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.bbi-multi-rewrite__spacer {
  flex: 1 1 auto;
}
</style>
