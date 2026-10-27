<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import { settings } from '@/state/settings';
import { fmtCount, normTag, type TagEntry } from '@/tagDict/dict';
import { loadTagDict, tagDict } from '@/tagDict/load';

/**
 * 带标签联想的 tag 输入框(编辑提示词弹窗的「画面 tag」「负面提示词」用)。
 * 光标所在的那一段(两个逗号之间)打中文或英文开头,框下面列出标签库里的候选,
 * 点一下把这一段换成英文标签。设置 → 标签库 里可以关。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    rows?: number;
    maxRows?: number;
    mono?: boolean;
    placeholder?: string;
  }>(),
  { rows: 1, maxRows: 12, mono: false, placeholder: '' },
);
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const wrap = ref<HTMLElement | null>(null);
/** 光标位置;-1 = 不在输入框里 */
const caret = ref(-1);
let blurTimer: ReturnType<typeof setTimeout> | undefined;

const enabled = computed(() => settings.autoTag.tagDict?.suggest !== false);

const SEP = /[,，\n]/;
const SPECIAL = /[:{}[\]()\\@|<>]/;

function textarea(): HTMLTextAreaElement | null {
  return wrap.value?.querySelector('textarea') ?? null;
}

function track(event: Event): void {
  const node = event.target as HTMLTextAreaElement | null;
  if (!node || node.tagName !== 'TEXTAREA') return;
  clearTimeout(blurTimer);
  caret.value = node.selectionEnd ?? node.value.length;
  if (enabled.value && !tagDict.value) void loadTagDict();
}

function leave(): void {
  // 点候选时焦点不会走(mousedown.prevent),这里只处理真正离开
  blurTimer = setTimeout(() => (caret.value = -1), 250);
}

/** 光标所在那一段的起止位置 */
const token = computed(() => {
  const value = props.modelValue;
  const at = caret.value;
  if (at < 0 || at > value.length) return null;
  let start = at;
  while (start > 0 && !SEP.test(value[start - 1])) start--;
  let end = at;
  while (end < value.length && !SEP.test(value[end])) end++;
  return { start, end, query: value.slice(start, at).trim(), whole: value.slice(start, end).trim() };
});

const items = computed<TagEntry[]>(() => {
  const dict = tagDict.value;
  const t = token.value;
  if (!enabled.value || !dict || !t || !t.query || SPECIAL.test(t.query)) return [];
  const zh = /[一-鿿]/.test(t.query);
  if (!zh && t.query.length < 2) return [];
  const whole = normTag(t.whole);
  const list = dict.suggest(t.query, 8);
  // 已经写对了就不打扰
  if (!zh && list.length && list[0][0] === whole) return [];
  return list;
});

function pick(entry: TagEntry): void {
  const t = token.value;
  if (!t) return;
  const value = props.modelValue;
  const before = value.slice(0, t.start);
  const after = value.slice(t.end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const head = `${before}${lead}${entry[0]}`;
  const next = after ? `${head}${after}` : `${head}, `;
  const pos = after ? head.length : next.length;
  emit('update:modelValue', next);
  caret.value = pos;
  void nextTick(() => {
    const node = textarea();
    if (!node) return;
    node.focus();
    node.setSelectionRange(pos, pos);
  });
}
</script>

<template>
  <div
    ref="wrap"
    class="bbi-tag-suggest"
    @input="track"
    @click="track"
    @keyup="track"
    @compositionend="track"
    @focusin="track"
    @focusout="leave"
  >
    <BbiTextarea
      :model-value="modelValue"
      :rows="rows"
      :max-rows="maxRows"
      :mono="mono"
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div v-if="items.length" class="bbi-tag-suggest__list" role="listbox" aria-label="标签候选">
      <button
        v-for="entry in items"
        :key="entry[0]"
        class="bbi-tag-suggest__item"
        type="button"
        role="option"
        :title="`${entry[0]}（${fmtCount(entry[2])} 张图用过）`"
        @mousedown.prevent
        @click="pick(entry)"
      >
        <span v-if="entry[1]" class="bbi-tag-suggest__zh">{{ entry[1] }}</span>
        <span class="bbi-tag-suggest__en">{{ entry[0] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bbi-tag-suggest {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.bbi-tag-suggest :deep(.bbi-textarea) {
  /* 调用方给的 class(字号、行高)落在外层,里面的输入框跟着它 */
  font-size: inherit;
  line-height: inherit;
}

.bbi-tag-suggest__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bbi-tag-suggest__item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid var(--bbi-line-strong);
  border-radius: var(--bbi-radius-pill);
  background: var(--bbi-surface-2);
  color: inherit;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.bbi-tag-suggest__item:hover,
.bbi-tag-suggest__item:focus-visible {
  border-color: var(--bbi-accent);
}

.bbi-tag-suggest__zh {
  flex-shrink: 0;
  max-width: 50%;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bbi-tag-suggest__en {
  overflow: hidden;
  opacity: 0.75;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
