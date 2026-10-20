<script setup lang="ts">
import { computed, ref } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';

import { MAX_REWRITE_HINT } from './hint';
import PassageList from './PassageList.vue';
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
const picked = ref<string[]>([]);

const hasPassageLine = computed(() =>
  props.modelValue.split('\n').some(line => line.startsWith(PASSAGE_HINT_PREFIX)),
);

function openPicker(): void {
  passages.value = floorPassages(passageFloor.value);
  picked.value = [];
  picking.value = true;
}

function confirmPick(): void {
  const chosen = passages.value.filter(p => picked.value.includes(p.id));
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
      <PassageList v-model="picked" :passages="passages" />
      <div class="bbi-passage-picker__actions">
        <button class="bbi-btn bbi-btn-sm" type="button" @click="picking = false">取消</button>
        <button
          class="bbi-btn bbi-btn-sm bbi-btn-primary"
          type="button"
          :disabled="!picked.length"
          @click="confirmPick"
        >
          就画这些{{ picked.length ? `（${picked.length} 段）` : '' }}
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

.bbi-passage-picker__tip {
  margin: 0;
  font-size: 12px;
  opacity: 0.75;
}

.bbi-passage-picker__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
