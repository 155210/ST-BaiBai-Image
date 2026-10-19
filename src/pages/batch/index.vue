<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import Collapsible from '@/components/Collapsible.vue';
import { batchState, refreshBatchJobs } from '@/batch/controller';
import { getContext } from '@/st/context';
import BatchSection from './BatchSection.vue';

/**
 * 批量页:批量写生图 tag、批量出图。两种任务各一个区块(BatchSection),同一时间只跑一种。
 * 逻辑都在 batch/controller.ts。
 */

/** 让预估随聊天变化重算。 */
const chatTick = ref(0);

function onChatChanged(): void {
  chatTick.value++;
  refreshBatchJobs();
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
    <p class="bbi-page-intro">
      不需要把楼显示在页面上，几千楼的聊天也不会卡。跑的时候请让酒馆页面留在前台：切到后台会自动暂停，回来接着跑；
      手机杀了后台再打开，点「继续」就行。同一时间只跑一种。
    </p>

    <div class="bbi-sections">
      <BatchSection kind="tag" :chat-tick="chatTick" />
      <BatchSection kind="image" :chat-tick="chatTick" />

      <Collapsible v-if="batchState.log.length" title="运行日志" :open="false">
        <ul class="bbi-batch-log">
          <li v-for="(line, index) in batchState.log" :key="index">{{ line }}</li>
        </ul>
      </Collapsible>
    </div>
  </section>
</template>

<style scoped>
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
