<script setup lang="ts">
import type { Passage } from './passage';

/**
 * 本楼正文的段落列表,点选高亮(可多选)。提示词弹窗里的「挑正文里的一段」与
 * 楼层「挑一段生图」弹窗共用。长段落只露前几行,手机上一屏能看到好几段。
 */
const props = defineProps<{
  passages: Passage[];
  /** 选中的段落 id */
  modelValue: string[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>();

function toggle(id: string): void {
  const picked = props.modelValue.includes(id)
    ? props.modelValue.filter(item => item !== id)
    : [...props.modelValue, id];
  // 保持正文顺序,要求里的段落编号才是从前到后
  emit('update:modelValue', props.passages.map(p => p.id).filter(item => picked.includes(item)));
}
</script>

<template>
  <p v-if="!passages.length" class="bbi-passage-empty">本楼正文没有可挑的段落。</p>
  <ul v-else class="bbi-passage-list">
    <li v-for="p in passages" :key="p.id">
      <button
        type="button"
        class="bbi-passage"
        :class="{ 'is-picked': modelValue.includes(p.id) }"
        :aria-pressed="modelValue.includes(p.id)"
        @click="toggle(p.id)"
      >
        <span class="bbi-passage__mark">{{ modelValue.includes(p.id) ? '✓' : p.id.slice(1) }}</span>
        <span class="bbi-passage__text">{{ p.text }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.bbi-passage-empty {
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
  display: -webkit-box;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
