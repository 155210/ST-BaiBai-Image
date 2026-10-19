<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import Collapsible from '@/components/Collapsible.vue';
import { confirmDialog } from '@/components/confirm';
import { parseFloorRange } from '@/batch/range';
import {
  batchBlocker,
  batchState,
  forgetBatch,
  isBatchEligible,
  refreshBatchJob,
  resumeBatch,
  retryFailed,
  reverifyBatch,
  startBatch,
  stopBatch,
} from '@/batch/tagBatch';
import { getContext } from '@/st/context';

/**
 * 批量页:按楼层范围批量写生图 tag。
 *
 * 逻辑都在 batch/tagBatch.ts,这里只管输入与展示。
 * 范围与间隔记在浏览器本地(只是方便下次打开),不进插件设置。
 */

const RANGE_KEY = 'bbi_batch_range';
const GAP_KEY = 'bbi_batch_gap_seconds';

function readLocal(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 记不住就算了 */
  }
}

const rangeText = ref(readLocal(RANGE_KEY, ''));
const gapSeconds = ref(Number(readLocal(GAP_KEY, '2')) || 0);
/** 让「预计」随聊天变化重算。 */
const chatTick = ref(0);

watch(rangeText, value => writeLocal(RANGE_KEY, value));
watch(gapSeconds, value => writeLocal(GAP_KEY, String(value)));

const gapMs = computed(() => Math.round(Math.min(60, Math.max(0, Number(gapSeconds.value) || 0)) * 1000));

const plan = computed(() => {
  void chatTick.value;
  void batchState.running;
  const chat = getContext()?.chat ?? [];
  try {
    const floors = parseFloorRange(rangeText.value, chat.length - 1);
    const todo = floors.filter(isBatchEligible);
    return { floors, todo, error: '' };
  } catch (error) {
    return { floors: [], todo: [], error: error instanceof Error ? error.message : String(error) };
  }
});

const job = computed(() => batchState.job);
const progress = computed(() => {
  const current = job.value;
  if (!current || !current.floors.length) return 0;
  return Math.round((current.cursor / current.floors.length) * 100);
});
const canResume = computed(
  () => !batchState.running && !!job.value && job.value.status !== 'done' && job.value.cursor < job.value.floors.length,
);
const statusText = computed(() => {
  const current = job.value;
  if (!current) return '';
  if (batchState.running) {
    if (batchState.waitingVisible) return '暂停中：页面在后台';
    return batchState.currentFloor !== null ? `正在跑第 ${batchState.currentFloor} 楼` : '运行中';
  }
  if (current.status === 'done') return '已跑完';
  return current.note || '上次没跑完';
});

async function start(): Promise<void> {
  const blocker = batchBlocker();
  if (blocker) {
    toastr.warning(blocker, '柏宝绘');
    return;
  }
  const { floors, todo, error } = plan.value;
  if (error) {
    toastr.warning(error, '柏宝绘');
    return;
  }
  if (!todo.length) {
    toastr.info('这个范围里没有需要写 tag 的楼（都已有 tag 或不是 AI 楼）', '柏宝绘');
    return;
  }
  const replacing = job.value && job.value.status !== 'done' ? '\n\n本聊天上次没跑完的记录会被这次覆盖。' : '';
  const ok = await confirmDialog({
    title: '批量写生图 tag',
    text:
      `范围内 ${floors.length} 楼，其中 ${todo.length} 楼需要写 tag（已有 tag 和非 AI 楼跳过）。\n` +
      `一楼一楼按顺序跑，每楼调用一次副 API，每楼之间隔 ${gapMs.value / 1000} 秒。\n` +
      `只写 tag，不会自动出图。${replacing}`,
    confirmText: '开始',
  });
  if (ok) startBatch(todo, gapMs.value);
}

function onChatChanged(): void {
  chatTick.value++;
  refreshBatchJob();
}

onMounted(() => {
  refreshBatchJob();
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

    <div class="bbi-sections">
      <Collapsible title="批量写生图 tag" :open="true">
        <p class="bbi-field-hint">
          按楼层范围，给还没有 tag 的 AI 楼逐楼写生图 tag，和点楼层上的「生成 tag」按钮效果一样。
          不需要把楼显示在页面上，几千楼的聊天也不会卡。跑的时候请让酒馆页面留在前台：切到后台会自动暂停，回来接着跑。
        </p>

        <div class="bbi-field">
          <div class="bbi-field-head">
            <span class="bbi-field-label">楼层范围</span>
            <span class="bbi-field-value">{{ plan.error ? '' : `需写 ${plan.todo.length} 楼` }}</span>
          </div>
          <input
            v-model="rangeText"
            class="bbi-input"
            type="text"
            inputmode="text"
            placeholder="留空 = 整个聊天；例：0-500, 800-"
            :disabled="batchState.running"
          />
          <p v-if="plan.error" class="bbi-field-hint bbi-batch-error">{{ plan.error }}</p>
          <p v-else class="bbi-field-hint">
            范围内 {{ plan.floors.length }} 楼，已有 tag 和非 AI 楼会跳过。楼号就是酒馆里显示的楼号。
          </p>
        </div>

        <label class="bbi-num-row">
          <span class="bbi-field-label">每楼间隔（秒）</span>
          <input
            v-model.number="gapSeconds"
            class="bbi-input bbi-num"
            type="number"
            min="0"
            max="60"
            step="1"
            :disabled="batchState.running"
          />
        </label>
        <p class="bbi-field-hint">副 API 有频率限制时调大一点。</p>

        <div class="bbi-batch-actions">
          <button
            v-if="!batchState.running"
            class="bbi-btn bbi-btn-primary"
            type="button"
            :disabled="batchState.verifying"
            @click="start"
          >
            开始
          </button>
          <button v-else class="bbi-btn bbi-btn-danger" type="button" @click="stopBatch">停止</button>
        </div>
      </Collapsible>

      <Collapsible v-if="job" title="本聊天的批量记录" :open="true">
        <div class="bbi-batch-status">
          <span>{{ statusText }}</span>
          <span class="bbi-batch-count">{{ job.cursor }}/{{ job.floors.length }}</span>
        </div>
        <div class="bbi-batch-bar"><div class="bbi-batch-bar-fill" :style="{ width: `${progress}%` }"></div></div>
        <p class="bbi-field-hint">
          写入 {{ job.written }} 楼 · AI 判断不需要图 {{ job.none }} 楼 · 跳过 {{ job.skipped }} 楼 · 失败
          {{ job.fails.length }} 楼
        </p>

        <p v-if="batchState.verifyNote" class="bbi-field-hint" :class="{ 'bbi-batch-error': batchState.unsaved.length }">
          {{ batchState.verifyNote }}
        </p>

        <div class="bbi-batch-actions">
          <button v-if="canResume" class="bbi-btn bbi-btn-primary" type="button" @click="resumeBatch(gapMs)">
            继续
          </button>
          <button
            v-if="!batchState.running && job.fails.length"
            class="bbi-btn"
            type="button"
            @click="retryFailed(gapMs)"
          >
            重试失败的 {{ job.fails.length }} 楼
          </button>
          <button
            v-if="!batchState.running && batchState.unsaved.length"
            class="bbi-btn bbi-btn-primary"
            type="button"
            :disabled="batchState.verifying"
            @click="reverifyBatch"
          >
            重新保存并核对
          </button>
          <button
            v-if="!batchState.running"
            class="bbi-btn bbi-btn-sm"
            type="button"
            :disabled="batchState.verifying"
            @click="forgetBatch"
          >
            清除记录
          </button>
        </div>

        <ul v-if="job.fails.length" class="bbi-batch-list">
          <li v-for="item in job.fails" :key="item.floor">
            <span class="bbi-batch-floor">#{{ item.floor }}</span>
            <span>{{ item.reason }}</span>
          </li>
        </ul>
      </Collapsible>

      <Collapsible v-if="batchState.log.length" title="运行日志" :open="false">
        <ul class="bbi-batch-list">
          <li v-for="(line, index) in batchState.log" :key="index">{{ line }}</li>
        </ul>
      </Collapsible>
    </div>
  </section>
</template>

<style scoped>
/* 危险按钮:scoped 过不了组件边界,同其它页各抄一份 */
.bbi-btn-danger {
  color: var(--bbi-danger);
  border-color: var(--bbi-line-strong);
}
.bbi-btn-danger:hover:not(:disabled) {
  color: var(--bbi-danger);
  border-color: var(--bbi-danger);
  background: var(--bbi-danger-soft);
}
.bbi-batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.bbi-batch-status {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.bbi-batch-count {
  font-family: var(--bbi-font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--bbi-accent);
}
.bbi-batch-bar {
  height: 6px;
  border-radius: var(--bbi-radius-pill);
  background: var(--bbi-surface-2);
  overflow: hidden;
  margin-bottom: 10px;
}
.bbi-batch-bar-fill {
  height: 100%;
  background: var(--bbi-accent);
  transition: width 0.3s ease;
}
.bbi-batch-error {
  color: var(--bbi-danger);
}
.bbi-batch-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  font-size: 12px;
  color: var(--bbi-ink-soft);
}
.bbi-batch-list li {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--bbi-line);
}
.bbi-batch-floor {
  flex: 0 0 auto;
  font-family: var(--bbi-font-mono);
  color: var(--bbi-ink);
}
</style>
