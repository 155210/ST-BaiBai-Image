<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import ModalMask from '@/components/ModalMask.vue';

import { MAX_REWRITE_HINT } from './hint';
import PassageList from './PassageList.vue';
import type { Passage } from './passage';

/**
 * 楼层「挑一段生图」/「再加图」弹窗。可以分几组挑段落,每组出一张,只调一次 AI(floorPassageGen.ts 命令式挂载,纪律同 PromptEditor:
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
  (e: 'submit', groups: string[][], extra: string): void;
  (e: 'close'): void;
}>();

const open = ref(false);
const groups = ref<string[][]>([[]]);
const current = ref(0);
const extra = ref('');

/** 当前这组选中的段落;改选时从别的组里拿走同一段(一段只归一张) */
const picked = computed({
  get: () => groups.value[current.value] ?? [],
  set: (ids: string[]) => {
    groups.value = groups.value.map((group, i) => (i === current.value ? ids : group.filter(id => !ids.includes(id))));
  },
});

/** 别的组的段落角标「图N」 */
const labels = computed(() => {
  const out: Record<string, string> = {};
  groups.value.forEach((group, i) => {
    if (i !== current.value) for (const id of group) out[id] = `图${i + 1}`;
  });
  return out;
});

const filled = computed(() => groups.value.filter(group => group.length));

function addGroup(): void {
  if (!picked.value.length) return;
  groups.value = [...groups.value, []];
  current.value = groups.value.length - 1;
}

function removeGroup(): void {
  if (groups.value.length <= 1) return;
  groups.value = groups.value.filter((_, i) => i !== current.value);
  current.value = Math.min(current.value, groups.value.length - 1);
}

function submit(): void {
  // 按正文顺序排,第 1 张就是最靠前的那组
  const order = props.passages.map(p => p.id);
  const sorted = filled.value.map(group => [...group]).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  emit('submit', sorted, extra.value);
}

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
    <div class="bbi-modal" role="dialog" aria-modal="true" aria-label="挑段落生图">
      <header class="bbi-modal-head">
        <span class="bbi-modal-title">{{ existing ? '再加图' : '挑段落生图' }}（第 {{ floor }} 楼）</span>
      </header>
      <p class="bbi-passage-gen__tip">
        点选要画的段落（可多选）就是一张图；想多出几张，点「＋ 再分一张」接着挑下一组。几张一起只问一次 AI，写完直接出图。
        <template v-if="existing">本楼已有 {{ existing }} 张图，新图会放在各自段落后面，原来的图不动。</template>
      </p>
      <div class="bbi-passage-gen__groups" role="tablist">
        <button
          v-for="(group, i) in groups"
          :key="i"
          type="button"
          role="tab"
          class="bbi-passage-gen__group"
          :class="{ 'is-current': i === current }"
          :aria-selected="i === current"
          @click="current = i"
        >
          图{{ i + 1 }}{{ group.length ? `·${group.length}段` : '' }}
        </button>
        <button
          type="button"
          class="bbi-passage-gen__group bbi-passage-gen__group--add"
          :disabled="!picked.length"
          :title="picked.length ? '' : '先给当前这张挑段落'"
          @click="addGroup"
        >
          ＋ 再分一张
        </button>
        <button v-if="groups.length > 1" type="button" class="bbi-passage-gen__group bbi-passage-gen__group--del" @click="removeGroup">
          删掉图{{ current + 1 }}
        </button>
      </div>
      <PassageList v-model="picked" :passages="passages" :labels="labels" />
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
          :disabled="!filled.length || !configured"
          :title="configured ? '' : '请先在柏宝绘「渠道」页完成配置'"
          @click="submit"
        >
          {{ existing ? '加' : '生成' }}{{ filled.length > 1 ? ` ${filled.length} 张` : '这一张' }}
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

.bbi-passage-gen__groups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bbi-passage-gen__group {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 16px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.bbi-passage-gen__group.is-current {
  border-color: var(--bbi-accent, #7c9cff);
  background: var(--bbi-accent, #7c9cff);
  color: #fff;
}

.bbi-passage-gen__group:disabled {
  opacity: 0.45;
  cursor: default;
}

.bbi-passage-gen__group--del {
  margin-left: auto;
  border-style: dashed;
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
