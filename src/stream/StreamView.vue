<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';

import { streamView, watchStream } from './live';
import { readOpenPref, writeOpenPref } from './openPref';

/**
 * 「实时输出」折叠区(本 fork 新增)。
 * 收起时不渲染文本、不跑刷新定时器;展开后每 0.5 秒刷新一次。展开状态记在浏览器本地。
 */

const open = ref(readOpenPref());
const box = ref<HTMLElement | null>(null);
let release: (() => void) | null = null;

watch(
  open,
  value => {
    writeOpenPref(value);
    if (value && !release) release = watchStream();
    if (!value && release) {
      release();
      release = null;
    }
  },
  { immediate: true },
);

// 贴底:用户没往上翻时跟着最新内容走
watch(
  () => streamView.text,
  async () => {
    const el = box.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    await nextTick();
    if (atBottom) el.scrollTop = el.scrollHeight;
  },
);

onUnmounted(() => {
  release?.();
  release = null;
});
</script>

<template>
  <section class="bbi-stream" :data-open="open ? '1' : ''">
    <button class="bbi-stream-head" type="button" :aria-expanded="open" @click="open = !open">
      <span>实时输出</span>
      <span class="bbi-stream-state">{{ open ? (streamView.running ? '接收中…' : '收起') : '点开看 AI 正在写什么' }}</span>
    </button>
    <div v-if="open" class="bbi-stream-body">
      <p class="bbi-stream-hint">
        要在副 API 渠道设置里打开「流式传输」才有内容。收起时不显示，省手机性能，不影响生成。
      </p>
      <template v-if="streamView.seen">
        <p class="bbi-stream-source">
          {{ streamView.source }}<template v-if="streamView.running"> · 接收中</template>
          <template v-else-if="streamView.error"> · {{ streamView.error }}</template>
          <template v-else> · 已结束</template>
        </p>
        <pre ref="box" class="bbi-stream-text">{{ streamView.text || '（等待第一段内容…）' }}</pre>
      </template>
      <p v-else class="bbi-stream-hint">还没有流式请求。</p>
    </div>
  </section>
</template>

<style scoped>
.bbi-stream {
  border: 1px solid var(--bbi-line);
  border-radius: var(--bbi-radius);
  background: var(--bbi-surface);
}
.bbi-stream-head {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: var(--bbi-ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.bbi-stream-state {
  font-size: 12px;
  font-weight: 400;
  color: var(--bbi-ink-soft);
}
.bbi-stream-body {
  padding: 0 14px 12px;
}
.bbi-stream-hint,
.bbi-stream-source {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--bbi-ink-soft);
}
.bbi-stream-text {
  margin: 0;
  max-height: 260px;
  overflow-y: auto;
  padding: 8px;
  border-radius: var(--bbi-radius-sm);
  background: var(--bbi-surface-2);
  color: var(--bbi-ink);
  font-family: var(--bbi-font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
