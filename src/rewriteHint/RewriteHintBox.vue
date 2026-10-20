<script setup lang="ts">
import { computed, ref } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';

import { MAX_REWRITE_HINT } from './hint';
import { applyPassageHint, floorPassages, passageFloor, passageHint, PASSAGE_HINT_PREFIX, type Passage } from './passage';

/**
 * 「AI 重写提示词」按钮上方的附加要求输入框(本 fork 独有,见 hint.ts)。
 * 只管输入;内容由 PromptEditor 随 emit('rewrite', hint) 交给调用方。
 * 「挑正文里的一段」点选本楼段落,把「只画这几段」写进要求(见 passage.ts)。
 */
const props = defineProps<{
  modelValue: string;
  /** 重写在途 / 写回中 / 未配置渠道时只读:要求已经发出去了,改了也不生效。 */
  disabled?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const picking = ref(false);
const passages = ref<Passage[]>([]);
const picked = ref<Set<string>>(new Set());

const hasPassageLine = computed(() =>
  props.modelValue.split('\n').some(line => line.startsWith(PASSAGE_HINT_PREFIX)),
);

function openPicker(): void {
  passages.value = floorPassages(passageFloor.value);
  picked.value = new Set();
  picking.value = true;
}

function toggle(id: string): void {
  const next = new Set(picked.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  picked.value = next;
}

function confirmPick(): void {
  const chosen = passages.value.filter(p => picked.value.has(p.id));
  emit('update:modelValue', applyPassageHint(props.modelValue, passageHint(chosen)));
  picking.value = false;
}

function clearPick(): void {
  emit('update:modelValue', applyPassageHint(props.modelValue, ''));
}
</script>

<template>
  <div class="bbi-rewrite-hint">
    <div class="bbi-rewrite-hint__head">
      <span class="bbi-modal-label">给 AI 的重写要求(可留空)</span>
      <button
        v-if="!picking"
        class="bbi-btn bbi-btn-sm bbi-rewrite-hint__pick"
        type="button"
        :disabled="disabled"
        title="点选本楼正文里的段落，AI 只按这几段画"
        @click="openPicker"
      >
        挑正文里的一段
      </button>
    </div>

    <div v-if="picking" class="bbi-passage-picker">
      <p class="bbi-passage-picker__tip">点选要画的段落（可多选），再点「就画这些」。</p>
      <p v-if="!passages.length" class="bbi-passage-picker__empty">本楼正文没有可挑的段落。</p>
      <ul v-else class="bbi-passage-list">
        <li v-for="p in passages" :key="p.id">
          <button
            type="button"
            class="bbi-passage"
            :class="{ 'is-picked': picked.has(p.id) }"
            :aria-pressed="picked.has(p.id)"
            @click="toggle(p.id)"
          >
            <span class="bbi-passage__mark">{{ picked.has(p.id) ? '✓' : p.id.slice(1) }}</span>
            <span class="bbi-passage__text">{{ p.text }}</span>
          </button>
        </li>
      </ul>
      <div class="bbi-passage-picker__actions">
        <button class="bbi-btn bbi-btn-sm" type="button" @click="picking = false">取消</button>
        <button
          class="bbi-btn bbi-btn-sm bbi-btn-primary"
          type="button"
          :disabled="!picked.size"
          @click="confirmPick"
        >
          就画这些{{ picked.size ? `（${picked.size} 段）` : '' }}
        </button>
      </div>
    </div>

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
    <button
      v-if="hasPassageLine && !disabled"
      class="bbi-rewrite-hint__clear"
      type="button"
      @click="clearPick"
    >
      不限段落了，去掉这句
    </button>
  </div>
</template>

<style scoped>
.bbi-rewrite-hint {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.bbi-rewrite-hint__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.bbi-rewrite-hint__input {
  width: 100%;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.6;
}

.bbi-rewrite-hint__clear {
  align-self: flex-start;
  padding: 2px 0;
  border: 0;
  background: none;
  color: inherit;
  opacity: 0.7;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.bbi-passage-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 8px;
}

.bbi-passage-picker__tip,
.bbi-passage-picker__empty {
  margin: 0;
  font-size: 12px;
  opacity: 0.75;
}

.bbi-passage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 45vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.bbi-passage {
  display: flex;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 6px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}

.bbi-passage.is-picked {
  border-color: var(--bbi-accent, #7c9cff);
  background: color-mix(in srgb, var(--bbi-accent, #7c9cff) 15%, transparent);
}

.bbi-passage__mark {
  flex: 0 0 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 12%, transparent);
  font-size: 12px;
  line-height: 22px;
  text-align: center;
}

.bbi-passage.is-picked .bbi-passage__mark {
  background: var(--bbi-accent, #7c9cff);
  color: #fff;
}

.bbi-passage__text {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  /* 长段落只露前几行,够认出是哪段;手机上一屏能看到好几段 */
  -webkit-line-clamp: 4;
  line-clamp: 4;
  white-space: pre-wrap;
  word-break: break-word;
}

.bbi-passage-picker__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
