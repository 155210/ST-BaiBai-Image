<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import Collapsible from '@/components/Collapsible.vue';
import { batchState, refreshBatchJobs } from '@/batch/controller';
import { parseFloorRange } from '@/batch/range';
import { batchRange } from '@/batch/rangeStore';
import { getContext } from '@/st/context';
import BatchSection from './BatchSection.vue';
import GalleryTab from './GalleryTab.vue';
import SearchTab from './SearchTab.vue';

/**
 * 批量页:三个标签共用一个楼层范围。
 * - 批量生成:批量写生图 tag、批量出图(BatchSection,同一时间只跑一种);
 * - 图片浏览:按范围翻看每个 tag 的图,重roll / 编辑提示词 / 定位(GalleryTab);
 * - 角色搜索:名字在哪些楼出现过(SearchTab)。
 * 逻辑都在 src/batch/。
 */

type Tab = 'run' | 'gallery' | 'search';
const TABS: { id: Tab; label: string }[] = [
  { id: 'run', label: '批量生成' },
  { id: 'gallery', label: '图片浏览' },
  { id: 'search', label: '角色搜索' },
];
const TAB_KEY = 'bbi_batch_tab';

function readTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some(tab => tab.id === saved) ? (saved as Tab) : 'run';
  } catch {
    return 'run';
  }
}

const tab = ref<Tab>(readTab());
watch(tab, value => {
  try {
    localStorage.setItem(TAB_KEY, value);
  } catch {
    /* 记不住就算了 */
  }
});

/** 让预估随聊天变化重算(chat 数组本身不是响应式的)。 */
const chatTick = ref(0);

function onChatChanged(): void {
  chatTick.value++;
  refreshBatchJobs();
}

const lastFloor = computed(() => {
  void chatTick.value;
  return (getContext()?.chat?.length ?? 0) - 1;
});

const rangeInfo = computed(() => {
  try {
    const floors = parseFloorRange(batchRange.text, lastFloor.value);
    return { text: `范围内 ${floors.length} 楼，最后一楼是 ${lastFloor.value}。`, error: false };
  } catch (error) {
    return { text: error instanceof Error ? error.message : String(error), error: true };
  }
});

const stepModel = computed({
  get: () => batchRange.step,
  set: value => {
    batchRange.step = Math.max(1, Math.min(100, Math.floor(Number(value)) || 1));
  },
});

function selectAll(): void {
  batchRange.text = '';
}

onMounted(() => {
  refreshBatchJobs();
  const context = getContext();
  context?.eventSource.on(context.eventTypes.CHAT_CHANGED, onChatChanged);
});

onUnmounted(() => {
  const context = getContext();
  context?.eventSource.off?.(context.eventTypes.CHAT_CHANGED, onChatChanged);
});
</script>

<template>
  <section class="bbi-page">
    <div class="bbi-page-head">
      <h2 class="bbi-title bbi-title-sub">批量</h2>
    </div>
    <hr class="bbi-rule" />

    <div class="bbi-segmented bbi-batch-tabs" role="tablist" aria-label="批量功能">
      <button
        v-for="item in TABS"
        :key="item.id"
        class="bbi-seg"
        :class="{ 'is-on': tab === item.id }"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="bbi-field bbi-batch-range">
      <span class="bbi-field-label">楼层范围</span>
      <div class="bbi-batch-range-row">
        <input
          v-model="batchRange.text"
          class="bbi-input"
          type="text"
          inputmode="text"
          placeholder="留空 = 整个聊天；例：0-500, 800-"
          :disabled="batchState.running !== null"
        />
        <button class="bbi-btn bbi-btn-sm" type="button" :disabled="batchState.running !== null" @click="selectAll">
          全部
        </button>
      </div>
      <p class="bbi-field-hint" :class="{ 'bbi-batch-error': rangeInfo.error }">
        {{ rangeInfo.text }}楼号就是酒馆里显示的楼号。
      </p>
    </div>

    <div v-show="tab === 'run'" class="bbi-sections">
      <p class="bbi-page-intro">
        不需要把楼显示在页面上，几千楼的聊天也不会卡。跑的时候请让酒馆页面留在前台：切到后台会自动暂停，回来接着跑；
        手机杀了后台再打开，点「继续」就行。同一时间只跑一种。
      </p>
      <label class="bbi-num-row">
        <span class="bbi-field-label">每几个 AI 楼出一次图</span>
        <input
          v-model.number="stepModel"
          class="bbi-input bbi-num"
          type="number"
          min="1"
          max="100"
          step="1"
          :disabled="batchState.running !== null"
        />
      </label>
      <p class="bbi-field-hint">
        填 1 就是每楼都要。填 3 就是范围内第 1、4、7… 个 AI 楼写 tag 和出图，其余的楼跳过。
      </p>

      <BatchSection kind="tag" :chat-tick="chatTick" />
      <BatchSection kind="image" :chat-tick="chatTick" />

      <Collapsible v-if="batchState.log.length" title="运行日志" :open="false">
        <ul class="bbi-batch-log">
          <li v-for="(line, index) in batchState.log" :key="index">{{ line }}</li>
        </ul>
      </Collapsible>
    </div>

    <GalleryTab v-if="tab === 'gallery'" :chat-tick="chatTick" @go-run="tab = 'run'" />
    <SearchTab v-show="tab === 'search'" :chat-tick="chatTick" />
  </section>
</template>

<style scoped>
.bbi-batch-tabs {
  display: flex;
  width: 100%;
  margin-bottom: 16px;
}
.bbi-batch-tabs .bbi-seg {
  flex: 1 1 0;
  justify-content: center;
  padding: 8px 4px;
}
.bbi-batch-range {
  margin-bottom: 16px;
}
.bbi-batch-range-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.bbi-batch-range-row .bbi-input {
  flex: 1 1 auto;
  min-width: 0;
}
.bbi-batch-error {
  color: var(--bbi-danger);
}
.bbi-batch-log {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  font-size: 12px;
  color: var(--bbi-ink-soft);
}
.bbi-batch-log li {
  padding: 4px 0;
  border-bottom: 1px solid var(--bbi-line);
}
</style>
