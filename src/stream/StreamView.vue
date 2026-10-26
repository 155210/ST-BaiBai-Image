<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';

import { cancelFloorTags } from '@/autoTag/runner';
import { copyText } from '@/st/clipboard';

import { drawFull, NOTHING_DRAWN, type Drawn } from './appendText';
import { currentFullText, currentLive, streamView, watchStream } from './live';
import { readOpenPref, writeOpenPref } from './openPref';

/**
 * 「实时输出」折叠区(本 fork 新增)。
 * 收起时不渲染文本、不跑刷新定时器;展开后每 0.5 秒刷新一次。展开状态记在浏览器本地。
 * 显示全文,新内容只追加到同一个 Text 节点上(appendText.ts),不每次整段重写。
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

// 跟随:在底部时跟着最新内容走;往上翻了就不自动滚到底(新内容照常追加在后面,看的地方不动),
// 滑回底部再接着跟。
const follow = ref(true);
const sink = ref<HTMLElement | null>(null);
const node = document.createTextNode('');
let drawn: Drawn = NOTHING_DRAWN;

function atBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

async function stickToBottom(): Promise<void> {
  await nextTick();
  if (box.value && follow.value) box.value.scrollTop = box.value.scrollHeight;
}

function draw(): void {
  const live = currentLive();
  if (!live || !sink.value) return;
  drawn = drawFull(node, live, drawn);
  void stickToBottom();
}

// 文本框是 v-if 里的:每次重新出现都把 Text 节点挂回去、整段重画
watch(sink, el => {
  if (!el) return;
  el.appendChild(node);
  drawn = NOTHING_DRAWN;
  draw();
});

watch(
  () => [streamView.id, streamView.total] as const,
  ([id], [prevId]) => {
    // 换了一条新请求:不管翻到哪,都跳到新的
    if (id !== prevId) follow.value = true;
    draw();
  },
);

function onScroll(): void {
  const el = box.value;
  if (!el) return;
  follow.value = atBottom(el);
}

watch(open, value => {
  if (value) resume();
});

function resume(): void {
  follow.value = true;
  draw();
  void stickToBottom();
}

function stop(): void {
  if (streamView.floor !== undefined) cancelFloorTags(streamView.floor);
}

async function copyAll(): Promise<void> {
  await copyText(currentFullText(), '实时输出已复制');
}

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
        <pre ref="box" class="bbi-stream-text" @scroll.passive="onScroll"><span v-if="!streamView.total">（等待第一段内容…）</span><span ref="sink"></span></pre>
        <div class="bbi-stream-tools">
          <button v-if="!follow" class="bbi-btn bbi-btn-sm" type="button" @click="resume">停在这里了，回到最新</button>
          <span class="bbi-stream-spacer"></span>
          <button
            v-if="streamView.running && streamView.floor !== undefined"
            class="bbi-btn bbi-btn-sm"
            type="button"
            title="中断这次写 tag，已收到的内容留着"
            @click="stop"
          >
            中断
          </button>
          <button class="bbi-btn bbi-btn-sm" type="button" :disabled="!streamView.total" @click="copyAll">复制全部</button>
        </div>
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
.bbi-stream-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.bbi-stream-spacer {
  flex: 1 1 auto;
}
</style>
