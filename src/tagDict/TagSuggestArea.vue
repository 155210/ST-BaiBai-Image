<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import { settings } from '@/state/settings';
import { fmtCount, normTag, type TagEntry } from '@/tagDict/dict';
import { loadTagDict, tagDict } from '@/tagDict/load';
import { parseWeight, stepWeight, type WeightStyle } from '@/tagDict/weight';

/**
 * 带标签联想的 tag 输入框(编辑提示词弹窗的画面 tag / 负面 / 角色 tag、角色库外貌字段、渠道固定提示词用)。
 * single = 单行 input(角色行、角色库字段),否则是自适应高度的多行框。
 * 光标所在的那一段(两个逗号之间)打中文或英文开头,框下面列出标签库里的候选,
 * 点一下把这一段换成英文标签。左边的「− 1.3 +」给这个 tag 加减权重。设置 → 标签库 里可以关。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    rows?: number;
    maxRows?: number;
    mono?: boolean;
    placeholder?: string;
    single?: boolean;
    readonly?: boolean;
  }>(),
  { rows: 1, maxRows: 12, mono: false, placeholder: '', single: false, readonly: false },
);
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const wrap = ref<HTMLElement | null>(null);
/** 光标位置;-1 = 不在输入框里 */
const caret = ref(-1);
let blurTimer: ReturnType<typeof setTimeout> | undefined;

const enabled = computed(() => !props.readonly && settings.autoTag.tagDict?.suggest !== false);

const SEP = /[,，\n]/;
const SPECIAL = /[:{}[\]()\\@|<>]/;

function field(): HTMLTextAreaElement | HTMLInputElement | null {
  return wrap.value?.querySelector('textarea, input') ?? null;
}

// 单行框照 BbiTextarea 的口径挡输入法拼音串。值不用 :value 绑:本组件一重绘(光标位置变了、
// 标签库读好了)Vue 就会把框里的字写回 modelValue,输入法打到一半的拼音会被冲掉
let composing = false;
const singleEl = ref<HTMLInputElement | null>(null);
function syncSingle(): void {
  if (singleEl.value && !composing && singleEl.value.value !== props.modelValue) singleEl.value.value = props.modelValue;
}
onMounted(syncSingle);
watch(() => props.modelValue, syncSingle);
function onSingleInput(event: Event): void {
  if (!composing) emit('update:modelValue', (event.target as HTMLInputElement).value);
}
function onSingleCompositionStart(): void {
  composing = true;
}
function onSingleCompositionEnd(event: CompositionEvent): void {
  composing = false;
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

function track(event: Event): void {
  const node = event.target as HTMLTextAreaElement | HTMLInputElement | null;
  if (!node || node !== field() || composing || (event as InputEvent).isComposing) return;
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

// —— 权重加减 ——
const weightOn = computed(() => !props.readonly && settings.autoTag.tagDict?.weight !== false);
/** 没写过权重的 tag 用哪种写法:NAI 渠道 1.3::tag::,其余 (tag:1.3) */
const weightStyle = computed<WeightStyle>(() => (settings.defaultBackend === 'nai' ? 'nai' : 'sd'));

/** 权重作用的那段:光标所在那段;那段是空的(刚点完候选、光标停在逗号后面)就用前一段 */
const weightTarget = computed(() => {
  if (!weightOn.value) return null;
  const t = token.value;
  if (!t) return null;
  let { start, end } = t;
  if (!t.whole) {
    if (start === 0) return null;
    end = start - 1;
    start = end;
    while (start > 0 && !SEP.test(props.modelValue[start - 1])) start--;
  }
  const raw = props.modelValue.slice(start, end);
  const text = raw.trim();
  if (!text || stepWeight(text, 0.1, weightStyle.value) === null) return null;
  return { start, end, raw, text, weight: parseWeight(text).weight };
});

function bump(delta: number): void {
  const w = weightTarget.value;
  if (!w) return;
  const next = stepWeight(w.text, delta, weightStyle.value);
  if (!next || next === w.text) return;
  const lead = /^\s*/.exec(w.raw)?.[0] ?? '';
  const trail = /\s*$/.exec(w.raw)?.[0] ?? '';
  const value = props.modelValue;
  const grow = next.length - w.text.length;
  // 光标在这段里就停在它末尾,在后面(前一段的情况)就跟着挪
  const at = caret.value;
  const pos = at <= w.end ? w.start + lead.length + next.length : at + grow;
  emit('update:modelValue', `${value.slice(0, w.start)}${lead}${next}${trail}${value.slice(w.end)}`);
  caret.value = pos;
  void nextTick(() => {
    const node = field();
    if (!node) return;
    node.focus();
    node.setSelectionRange(pos, pos);
  });
}

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
    const node = field();
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
    <input
      v-if="single"
      ref="singleEl"
      class="bbi-input bbi-tag-suggest__input"
      type="text"
      spellcheck="false"
      :placeholder="placeholder"
      :readonly="readonly"
      @input="onSingleInput"
      @compositionstart="onSingleCompositionStart"
      @compositionend="onSingleCompositionEnd"
    />
    <BbiTextarea
      v-else
      :model-value="modelValue"
      :rows="rows"
      :max-rows="maxRows"
      :mono="mono"
      :placeholder="placeholder"
      :readonly="readonly"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div v-if="items.length || weightTarget" class="bbi-tag-suggest__list" role="listbox" aria-label="标签候选">
      <div v-if="weightTarget" class="bbi-tag-suggest__weight" :title="`${weightTarget.text} 的权重`">
        <button type="button" aria-label="权重减 0.1" @mousedown.prevent @click="bump(-0.1)">−</button>
        <span>{{ weightTarget.weight }}</span>
        <button type="button" aria-label="权重加 0.1" @mousedown.prevent @click="bump(0.1)">+</button>
      </div>
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

.bbi-tag-suggest.bbi-prompt-area :deep(.bbi-textarea) {
  /* 调用方的 .bbi-prompt-area(字号、行高)落在外层,里面的输入框跟着它 */
  font-size: inherit;
  line-height: inherit;
}

.bbi-tag-suggest__input {
  width: 100%;
  box-sizing: border-box;
}

.bbi-tag-suggest__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bbi-tag-suggest__weight {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid var(--bbi-line-strong);
  border-radius: var(--bbi-radius-pill);
  background: var(--bbi-surface-2);
  font-size: 12px;
  line-height: 1.4;
}

.bbi-tag-suggest__weight button {
  min-width: 40px;
  min-height: 32px;
  padding: 4px 12px;
  border: 0;
  background: none;
  color: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.bbi-tag-suggest__weight button:hover,
.bbi-tag-suggest__weight button:focus-visible {
  color: var(--bbi-accent);
}

.bbi-tag-suggest__weight span {
  min-width: 2.5em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.bbi-tag-suggest__item {
  display: inline-flex;
  flex-wrap: wrap;
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
  min-width: 0;
  opacity: 0.75;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
