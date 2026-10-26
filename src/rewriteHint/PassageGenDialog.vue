<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import ModalMask from '@/components/ModalMask.vue';

import { MAX_REWRITE_HINT } from './hint';
import PassageList from './PassageList.vue';
import type { ImageMarks } from './floorPassageGen';
import type { Passage } from './passage';

/**
 * 楼层「挑一段生图」/「再加图」/「重新生成」弹窗。可以分几组挑段落,每组出一张,只调一次 AI;
 * 重新生成时还能不指定段落、只定最多几张(floorPassageGen.ts 命令式挂载,纪律同 PromptEditor:
 * 状态一律走 props/emit,不用 ref 拿实例)。
 */
const props = defineProps<{
  floor: number;
  passages: Passage[];
  configured: boolean;
  closing?: boolean;
  /** 本楼已有几张图;大于 0 就是「再加一张」 */
  existing?: number;
  /** 给了就是已有 tag 的楼「重新生成」:多一个「不指定段落」模式,值是「最多几张」的初始值 */
  regenMax?: number;
  /** 再加图时:原来的图插在哪几段后面 */
  marks?: ImageMarks;
  /** 再加图时:哪几段出过第几张 */
  drawn?: Record<string, number[]>;
  /** 上次没写成时带回来的分组与要求 */
  initial?: { groups: string[][]; extra: string };
  /** initial 是上次没写成带回来的,还是上次选了没生成、自动存下的 */
  initialKind?: 'failed' | 'draft';
}>();

const emit = defineEmits<{
  (e: 'submit', groups: string[][], extra: string): void;
  (e: 'auto', count: number): void;
  /** 选择一变就发:调用方存起来,下次打开接着选(全空 = 清掉存档) */
  (e: 'save', groups: string[][], extra: string): void;
  (e: 'close'): void;
}>();

const open = ref(false);
const regen = computed(() => props.regenMax !== undefined);
/** 重新生成默认不指定段落(和原来点「重新生成」一样由 AI 挑) */
const mode = ref<'auto' | 'pick'>(props.regenMax !== undefined && !props.initial ? 'auto' : 'pick');
const count = ref(Math.max(1, Math.floor(props.regenMax ?? 1)));
const countValid = computed(() => Number.isInteger(count.value) && count.value >= 1);
const groups = ref<string[][]>(props.initial ? props.initial.groups.map(g => [...g]) : [[]]);
const current = ref(0);
const extra = ref(props.initial?.extra ?? '');

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

/** 带回来的选择还在用(点了「清空」就不再提示) */
const restored = ref(!!props.initial);
const canClear = computed(() => filled.value.length > 0 || !!extra.value.trim());

function clearAll(): void {
  groups.value = [[]];
  current.value = 0;
  extra.value = '';
  restored.value = false;
}

// 选了就存,不用手动保存;关掉、切后台被杀都还在,生成或点「清空」才清掉
watch([groups, extra], () => emit('save', groups.value.map(group => [...group]), extra.value), { deep: true });

const strip = ref<HTMLElement | null>(null);

// 图多了标签横向滚动:切到哪张就把那颗滚进视野
watch(current, () =>
  nextTick(() => strip.value?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })),
);

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
  if (mode.value === 'auto') {
    if (countValid.value) emit('auto', count.value);
    return;
  }
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
        <span class="bbi-modal-title">{{ regen ? '重新生成 tag' : existing ? '再加图' : '挑段落生图' }}（第 {{ floor }} 楼）</span>
      </header>
      <template v-if="regen">
        <p class="bbi-passage-gen__tip">会先删掉本楼原来的 tag 再写新的；已生成的图片保留在卡片历史里，不会丢失。</p>
        <div class="bbi-segmented" role="tablist" aria-label="画哪些段落">
          <button class="bbi-seg" :class="{ 'is-on': mode === 'auto' }" type="button" role="tab" :aria-selected="mode === 'auto'" @click="mode = 'auto'">
            不指定段落
          </button>
          <button class="bbi-seg" :class="{ 'is-on': mode === 'pick' }" type="button" role="tab" :aria-selected="mode === 'pick'" @click="mode = 'pick'">
            指定段落
          </button>
        </div>
      </template>
      <label v-if="mode === 'auto'" class="bbi-passage-gen__count">
        <span class="bbi-modal-label">最多几张（AI 自己挑画面，不设上限）</span>
        <input v-model.number="count" class="bbi-input" type="number" min="1" step="1" inputmode="numeric" enterkeyhint="done" />
      </label>
      <template v-else>
      <p class="bbi-passage-gen__tip">
        点选要画的段落（可多选）就是一张图；想多出几张，点「＋ 再分一张」接着挑下一组。几张一起只问一次 AI，写完直接出图。
        <template v-if="existing && !regen">本楼已有 {{ existing }} 张图（列表里标了各插在哪段后面；按段落出的会在那几段上标「出过第 N 张」），新图会放在各自段落后面，原来的图不动。</template>
      </p>
      <p v-if="restored && initial && initialKind !== 'draft'" class="bbi-passage-gen__tip bbi-passage-gen__restored">上次没写成，已带上上次选的 {{ initial.groups.length }} 组段落和要求，可以直接再发。</p>
      <p v-if="restored && initialKind === 'draft'" class="bbi-passage-gen__tip bbi-passage-gen__restored">
        接着上次没生成的选（{{ filled.length }} 组段落），想重选点左下角「清空」。
      </p>
      <div ref="strip" class="bbi-passage-gen__groups" role="tablist">
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
      </div>
      <div class="bbi-passage-gen__actions">
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
      <PassageList v-model="picked" class="bbi-passage-gen__list" :passages="passages" :labels="labels" :marks="marks" :drawn="drawn" />
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
      </template>
      <footer class="bbi-modal-foot">
        <button
          v-if="mode === 'pick'"
          class="bbi-btn"
          type="button"
          :disabled="!canClear"
          title="清掉选好的段落和要求，重新选"
          @click="clearAll"
        >
          清空
        </button>
        <span class="bbi-passage-gen__spacer"></span>
        <button class="bbi-btn" type="button" @click="emit('close')">取消</button>
        <button
          class="bbi-btn bbi-btn-primary"
          type="button"
          :disabled="(mode === 'auto' ? !countValid : !filled.length) || !configured"
          :title="configured ? '' : '请先在柏宝绘「渠道」页完成配置'"
          @click="submit"
        >
          <template v-if="mode === 'auto'">重新生成</template>
          <template v-else>{{ existing && !regen ? '加' : '生成' }}{{ filled.length > 1 ? ` ${filled.length} 张` : '这一张' }}</template>
        </button>
      </footer>
    </div>
  </ModalMask>
</template>

<style scoped>
.bbi-passage-gen__restored {
  color: var(--bbi-accent, inherit);
}

.bbi-passage-gen__tip {
  margin: 0;
  font-size: 12.5px;
  opacity: 0.8;
}

/* 图多了只占一行、横向滑动,别把下面的段落列表挤没 */
.bbi-passage-gen__groups {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.bbi-passage-gen__groups .bbi-passage-gen__group {
  flex-shrink: 0;
  white-space: nowrap;
}

.bbi-passage-gen__actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

/* 段落列表不跟着弹窗压缩:弹窗放不下时整体滚动 */
.bbi-passage-gen__list {
  flex-shrink: 0;
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

.bbi-passage-gen__count {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bbi-passage-gen__count .bbi-input {
  width: 8em;
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
