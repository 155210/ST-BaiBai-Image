<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

import Icon from '@/components/Icon.vue';
import type { ImageTagContent } from '@/st/imageTagRegex';
import StreamView from '@/stream/StreamView.vue';

import { editPromptOnly } from './edit';

/**
 * 编辑提示词弹窗里的「只改提示词（不发正文）」按钮(本 fork 独有,见 edit.ts)。
 * 改好的结果 emit 给弹窗填进输入框,不落盘;用户看过再点「应用」。
 */
const props = defineProps<{
  /** 输入框里现在的提示词(含没应用的手改) */
  draft: ImageTagContent;
  /** 上面那个「给 AI 的要求」 */
  hint: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ (e: 'result', value: ImageTagContent): void }>();

const running = ref(false);
const done = ref(false);
let controller: AbortController | null = null;

async function run(): Promise<void> {
  if (running.value || props.disabled || !props.hint.trim()) return;
  running.value = true;
  done.value = false;
  controller = new AbortController();
  const signal = controller.signal;
  try {
    const next = await editPromptOnly(props.draft, props.hint, signal);
    if (signal.aborted) return;
    emit('result', next);
    done.value = true;
  } catch (error) {
    if (!signal.aborted) toastr.error(error instanceof Error ? error.message : String(error), '柏宝绘');
  } finally {
    running.value = false;
    controller = null;
  }
}

function cancel(): void {
  controller?.abort();
}

onBeforeUnmount(cancel);
</script>

<template>
  <div class="bbi-prompt-only">
    <button
      v-if="!running"
      class="bbi-btn bbi-btn-sm"
      type="button"
      :disabled="disabled || !hint.trim()"
      :title="hint.trim() ? '只把现在的提示词和上面的要求发给 AI，不发正文，改好填进下面的输入框' : '先在上面写要怎么改'"
      @click="run"
    >
      <Icon name="edit" /> 只改提示词（不发正文）
    </button>
    <template v-else>
      <span class="bbi-prompt-only__busy">AI 正在按要求改提示词…</span>
      <button class="bbi-btn bbi-btn-sm" type="button" @click="cancel">取消</button>
    </template>
  </div>
  <StreamView v-if="running" />
  <p v-if="done && !running" class="bbi-editor-note">
    AI 改好了，已经填进下面的输入框（还没保存）。看一下没问题就点「应用」或「应用并重新生成」。
  </p>
</template>

<style scoped>
.bbi-prompt-only {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.bbi-prompt-only__busy {
  font-size: 12.5px;
  opacity: 0.8;
}
</style>
