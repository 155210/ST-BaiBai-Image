<script setup lang="ts">
import { computed, ref } from 'vue';
import { openMultiRewriteFor } from '@/rewriteHint/floorMultiRewrite';
import { openPassageGenFor } from '@/rewriteHint/floorPassageGen';
import { floorInfo, runFloorTag } from './tag';

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
const busy = ref(false);
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

async function tag(): Promise<void> {
  remember();
  busy.value = true;
  try {
    await runFloorTag(floor.value);
  } finally {
    busy.value = false;
    tick.value++;
  }
}

function passage(): void {
  remember();
  openPassageGenFor(floor.value);
}

function multi(): void {
  remember();
  openMultiRewriteFor(floor.value);
}
</script>

<template>
  <div class="bbi-single-floor">
    <label class="bbi-num-row">
      <span class="bbi-field-label">楼号</span>
      <input
        v-model="text"
        class="bbi-input bbi-num"
        type="number"
        min="0"
        :max="lastFloor"
        step="1"
        :placeholder="`0–${lastFloor}`"
        @change="tick++"
      />
    </label>
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
.bbi-single-floor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
