<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import Collapsible from '@/components/Collapsible.vue';
import { confirmDialog } from '@/components/confirm';
import {
  batchBlocker,
  batchState,
  forgetBatch,
  needsImage,
  needsTag,
  pendingImageCount,
  resumeBatch,
  retryFailed,
  reverifyBatch,
  startBatch,
  stopBatch,
} from '@/batch/controller';
import type { BatchKind } from '@/batch/jobStore';
import { parseFloorRange } from '@/batch/range';
import { getContext } from '@/st/context';

/**
 * 批量页的一种任务(写 tag / 出图):输入、开跑确认、进度与本聊天的记录。
 * 逻辑都在 batch/controller.ts,这里只管输入与展示。
 * 范围与间隔记在浏览器本地(只是方便下次打开),不进插件设置。
 */

const props = defineProps<{
  kind: BatchKind;
  /** 聊天变化时 +1,让预估重算(chat 数组本身不是响应式的)。 */
  chatTick: number;
}>();

const TEXT = {
  tag: {
    title: '批量写生图 tag',
    intro:
      '按楼层范围，给还没有 tag 的 AI 楼逐楼写生图 tag，和点楼层上的「生成 tag」按钮效果一样。只写 tag，不出图。',
    unit: '楼需要写 tag',
    skip: '已有 tag 和非 AI 楼会跳过',
    gapHint: '副 API 有频率限制时调大一点。',
    defaultGap: '2',
  },
  image: {
    title: '批量出图',
    intro:
      '按楼层范围，给已经写好、但还没出过图的 tag 逐张出图，和点卡片上的「生成图片」效果一样。改过提示词、只剩旧图的也会出一张新的。',
    unit: '楼有没图的 tag',
    skip: '没有 tag 或图都已出好的楼会跳过',
    gapHint: '每楼出完后等一会儿再出下一楼，出图渠道有频率限制时调大一点。',
    defaultGap: '3',
  },
}[props.kind];

const RANGE_KEY = `bbi_batch_${props.kind}_range`;
const GAP_KEY = `bbi_batch_${props.kind}_gap_seconds`;

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
const gapSeconds = ref(Number(readLocal(GAP_KEY, TEXT.defaultGap)) || 0);

watch(rangeText, value => writeLocal(RANGE_KEY, value));
watch(gapSeconds, value => writeLocal(GAP_KEY, String(value)));

const gapMs = computed(() => Math.round(Math.min(60, Math.max(0, Number(gapSeconds.value) || 0)) * 1000));
const eligible = props.kind === 'tag' ? needsTag : needsImage;

const plan = computed(() => {
  void props.chatTick;
  void batchState.running;
  const chat = getContext()?.chat ?? [];
  try {
    const floors = parseFloorRange(rangeText.value, chat.length - 1);
    const todo = floors.filter(eligible);
    const images = props.kind === 'image' ? todo.reduce((sum, floor) => sum + pendingImageCount(floor), 0) : 0;
    return { floors, todo, images, error: '' };
  } catch (error) {
    return { floors: [], todo: [], images: 0, error: error instanceof Error ? error.message : String(error) };
  }
});

const running = computed(() => batchState.running === props.kind);
const busy = computed(() => batchState.running !== null);
const job = computed(() => batchState.jobs[props.kind]);
const progress = computed(() => {
  const current = job.value;
  if (!current || !current.floors.length) return 0;
  return Math.round((current.cursor / current.floors.length) * 100);
});
const canResume = computed(
  () => !busy.value && !!job.value && job.value.status !== 'done' && job.value.cursor < job.value.floors.length,
);
const statusText = computed(() => {
  const current = job.value;
  if (!current) return '';
  if (running.value) {
    if (batchState.waitingVisible) return '暂停中：页面在后台';
    return batchState.currentFloor !== null ? `正在跑第 ${batchState.currentFloor} 楼` : '运行中';
  }
  if (current.status === 'done') return '已跑完';
  return current.note || '上次没跑完';
});
const countText = computed(() => {
  const current = job.value;
  if (!current) return '';
  const head =
    props.kind === 'tag'
      ? `写入 ${current.written} 楼 · AI 判断不需要图 ${current.none} 楼`
      : `出了图 ${current.written} 楼`;
  return `${head} · 跳过 ${current.skipped} 楼 · 失败 ${current.fails.length} 楼`;
});

async function start(): Promise<void> {
  const blocker = batchBlocker(props.kind);
  if (blocker) {
    toastr.warning(blocker, '柏宝绘');
    return;
  }
  const { floors, todo, images, error } = plan.value;
  if (error) {
    toastr.warning(error, '柏宝绘');
    return;
  }
  if (!todo.length) {
    toastr.info(`这个范围里没有要处理的楼（${TEXT.skip}）`, '柏宝绘');
    return;
  }
  const replacing = job.value && job.value.status !== 'done' ? '\n\n本聊天上次没跑完的记录会被这次覆盖。' : '';
  const body =
    props.kind === 'tag'
      ? `范围内 ${floors.length} 楼，其中 ${todo.length} 楼需要写 tag（已有 tag 和非 AI 楼跳过）。\n` +
        `一楼一楼按顺序跑，每楼调用一次副 API，每楼之间隔 ${gapMs.value / 1000} 秒。\n只写 tag，不会自动出图。`
      : `范围内 ${floors.length} 楼，其中 ${todo.length} 楼共 ${images} 张图还没出。\n` +
        `一张一张按顺序出，每楼之间隔 ${gapMs.value / 1000} 秒。会消耗出图额度。`;
  const ok = await confirmDialog({ title: TEXT.title, text: body + replacing, confirmText: '开始' });
  if (ok) startBatch(props.kind, todo, gapMs.value);
}
</script>

<template>
  <Collapsible :title="TEXT.title" :open="true">
    <p class="bbi-field-hint">{{ TEXT.intro }}</p>

    <div class="bbi-field">
      <div class="bbi-field-head">
        <span class="bbi-field-label">楼层范围</span>
        <span class="bbi-field-value">
          {{ plan.error ? '' : kind === 'tag' ? `需写 ${plan.todo.length} 楼` : `${plan.todo.length} 楼 ${plan.images} 张` }}
        </span>
      </div>
      <input
        v-model="rangeText"
        class="bbi-input"
        type="text"
        inputmode="text"
        placeholder="留空 = 整个聊天；例：0-500, 800-"
        :disabled="busy"
      />
      <p v-if="plan.error" class="bbi-field-hint bbi-batch-error">{{ plan.error }}</p>
      <p v-else class="bbi-field-hint">
        范围内 {{ plan.floors.length }} 楼，{{ TEXT.skip }}。楼号就是酒馆里显示的楼号。
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
        :disabled="busy"
      />
    </label>
    <p class="bbi-field-hint">{{ TEXT.gapHint }}</p>

    <div class="bbi-batch-actions">
      <button v-if="running" class="bbi-btn bbi-btn-danger" type="button" @click="stopBatch">停止</button>
      <button
        v-else
        class="bbi-btn bbi-btn-primary"
        type="button"
        :disabled="busy || batchState.verifying"
        @click="start"
      >
        开始
      </button>
    </div>

    <template v-if="job">
      <hr class="bbi-rule bbi-batch-rule" />
      <div class="bbi-batch-status">
        <span>{{ statusText }}</span>
        <span class="bbi-batch-count">{{ job.cursor }}/{{ job.floors.length }}</span>
      </div>
      <div class="bbi-batch-bar"><div class="bbi-batch-bar-fill" :style="{ width: `${progress}%` }"></div></div>
      <p class="bbi-field-hint bbi-batch-counts">{{ countText }}</p>

      <p
        v-if="batchState.verifyNote[kind]"
        class="bbi-field-hint bbi-batch-verify"
        :class="{ 'bbi-batch-error': batchState.unsaved[kind].length }"
      >
        {{ batchState.verifyNote[kind] }}
      </p>

      <div class="bbi-batch-actions">
        <button v-if="canResume" class="bbi-btn bbi-btn-primary" type="button" @click="resumeBatch(kind, gapMs)">
          继续
        </button>
        <button v-if="!busy && job.fails.length" class="bbi-btn" type="button" @click="retryFailed(kind, gapMs)">
          重试失败的 {{ job.fails.length }} 楼
        </button>
        <button
          v-if="!busy && batchState.unsaved[kind].length"
          class="bbi-btn bbi-btn-primary"
          type="button"
          :disabled="batchState.verifying"
          @click="reverifyBatch(kind)"
        >
          重新保存并核对
        </button>
        <button
          v-if="!busy"
          class="bbi-btn bbi-btn-sm"
          type="button"
          :disabled="batchState.verifying"
          @click="forgetBatch(kind)"
        >
          清除记录
        </button>
      </div>

      <ul v-if="job.fails.length" class="bbi-batch-list bbi-batch-fails">
        <li v-for="item in job.fails" :key="item.floor">
          <span class="bbi-batch-floor">#{{ item.floor }}</span>
          <span>{{ item.reason }}</span>
        </li>
      </ul>
    </template>
  </Collapsible>
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
.bbi-batch-rule {
  margin: 16px 0 12px;
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
