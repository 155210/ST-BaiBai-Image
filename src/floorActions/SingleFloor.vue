<script setup lang="ts">
import { computed, ref } from 'vue';
import { openMultiRewriteFor } from '@/rewriteHint/floorMultiRewrite';
import { openPassageGenFor } from '@/rewriteHint/floorPassageGen';
import { getContext } from '@/st/context';
import { stepFloor } from './step';
import { floorInfo, imagesAfterTag, isTagRunning, runFloorTag } from './tag';

/** fork:批量页「单楼操作」——填楼号,直接做楼层 🎧 里的三件事,不用在聊天里翻到那一楼。 */

const props = defineProps<{ chatTick: number; lastFloor: number }>();

const KEY = 'bbi_single_floor';
function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
/** type=number 的输入框 Vue 会给数字,空着时是空串;统一按字符串处理。 */
const text = ref<string | number>(read());
const raw = computed(() => String(text.value ?? '').trim());
/** 点完按钮后刷新一下信息(写 tag 是异步的,chat 本身不是响应式)。 */
const tick = ref(0);

const floor = computed(() => (raw.value === '' ? NaN : Number(raw.value)));
const info = computed(() => {
  void props.chatTick;
  void tick.value;
  if (Number.isNaN(floor.value)) return null;
  return floorInfo(floor.value);
});

function remember(): void {
  try {
    localStorage.setItem(KEY, raw.value);
  } catch {
    /* 记不住就算了 */
  }
}

/** 上一楼 / 下一楼:跳到隔壁能操作的剧情楼,不用再手填楼号。 */
function canStep(dir: 1 | -1): boolean {
  void props.chatTick;
  return stepTarget(dir) !== null;
}
function stepTarget(dir: 1 | -1): number | null {
  const count = getContext()?.chat?.length ?? 0;
  return stepFloor(count, floor.value, dir, f => floorInfo(f).ok);
}
function step(dir: 1 | -1): void {
  const next = stepTarget(dir);
  if (next === null) return;
  text.value = String(next);
  remember();
  tick.value++;
}

/** 只锁正在写的这一楼;换个楼号就能接着点,几楼可以同时写。 */
const busy = computed(() => !Number.isNaN(floor.value) && isTagRunning(floor.value));

async function tag(): Promise<void> {
  remember();
  try {
    await runFloorTag(floor.value);
  } finally {
    tick.value++;
  }
}

function passage(): void {
  remember();
  const at = floor.value;
  openPassageGenFor(at, undefined, outcome => {
    tick.value++;
    if (outcome.kind === 'written') void imagesAfterTag(at).finally(() => tick.value++);
  });
}

function multi(): void {
  remember();
  const at = floor.value;
  // 这一楼多半没显示在聊天里,没有卡片来出图:改完在这里接着出
  openMultiRewriteFor(at, undefined, outcome => {
    tick.value++;
    if (outcome.kind === 'written') void imagesAfterTag(at).finally(() => tick.value++);
  });
}
</script>

<template>
  <div class="bbi-single-floor">
    <div class="bbi-num-row">
      <span class="bbi-field-label">楼号</span>
      <span class="bbi-single-floor__nav">
      <button class="bbi-btn" type="button" title="上一个剧情楼" :disabled="!canStep(-1)" @click="step(-1)">上一楼</button>
      <input
        v-model="text"
        class="bbi-input bbi-num"
        type="number"
        min="0"
        :max="lastFloor"
        step="1"
        :placeholder="`0–${lastFloor}`"
        aria-label="楼号"
        @change="tick++"
      />
      <button class="bbi-btn" type="button" title="下一个剧情楼" :disabled="!canStep(1)" @click="step(1)">下一楼</button>
      </span>
    </div>
    <p class="bbi-field-hint">
      <template v-if="!info">填楼号（楼层左边显示的 # 后面那个数），不用在聊天里翻到那一楼。</template>
      <template v-else-if="!info.ok">{{ info.reason }}</template>
      <template v-else-if="info.hasTags">这一楼已有 tag，{{ info.images }} 张图。</template>
      <template v-else>这一楼还没有 tag。</template>
    </p>
    <div class="bbi-single-floor__actions">
      <button class="bbi-btn" type="button" :disabled="!info?.ok || busy" @click="tag">
        {{ busy ? '正在写 tag…' : info?.hasTags ? '重新生成 tag' : '生成生图 tag' }}
      </button>
      <button class="bbi-btn" type="button" :disabled="!info?.ok" @click="passage">
        {{ info?.images ? '挑段落再加图' : '挑段落生图' }}
      </button>
      <button class="bbi-btn" type="button" :disabled="!info?.ok || !info.images" @click="multi">一起改这层的图</button>
    </div>
  </div>
</template>

<style scoped>
.bbi-single-floor__nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bbi-single-floor__nav .bbi-btn {
  flex: 0 0 auto;
  padding-inline: 10px;
}

.bbi-single-floor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
