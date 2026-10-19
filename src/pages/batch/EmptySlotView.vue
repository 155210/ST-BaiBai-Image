<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

import LightboxNavButtons from '@/lightboxNav/LightboxNav.vue';
import type { LightboxNav } from '@/lightboxNav/types';
import { modalHost } from '@/state/ui';

/**
 * 图片浏览大图模式里切到「还没有图」的卡片时显示这个(本 fork 新增)。
 * 样子跟灯箱一样是全屏黑底,中间写「还没有图」和生成按钮,两侧照样有左右箭头。
 */

defineProps<{
  nav: LightboxNav;
  title: string;
  /** 生成状态(reactive,由 galleryLightbox.ts 定时更新)。 */
  state: { busy: boolean; busyText: string; error: string };
  prompt: string;
}>();

const emit = defineEmits<{ close: []; generate: []; cancel: [] }>();

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}
onMounted(() => document.addEventListener('keydown', onKeydown, true));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true));
</script>

<template>
  <Teleport :to="modalHost" :disabled="!modalHost">
    <div class="bbi-empty-lb" @click="emit('close')">
      <div class="bbi-empty-lb__bar" @click.stop>
        <button class="bbi-empty-lb__close" type="button" title="关闭 (Esc)" @click="emit('close')">✕</button>
      </div>
      <div class="bbi-empty-lb__body" @click.stop>
        <p class="bbi-empty-lb__title">{{ title }}</p>
        <template v-if="state.busy">
          <p class="bbi-empty-lb__state">{{ state.busyText }}</p>
          <button class="bbi-empty-lb__btn" type="button" @click="emit('cancel')">取消</button>
        </template>
        <template v-else>
          <p class="bbi-empty-lb__state">还没有图</p>
          <p v-if="state.error" class="bbi-empty-lb__error">{{ state.error }}</p>
          <button class="bbi-empty-lb__btn is-main" type="button" @click="emit('generate')">生成图片</button>
        </template>
        <p v-if="prompt" class="bbi-empty-lb__prompt">{{ prompt }}</p>
      </div>
      <LightboxNavButtons :nav="nav" />
    </div>
  </Teleport>
</template>

<style scoped>
.bbi-empty-lb {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  z-index: 10050;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: oklch(0 0 0 / 0.82);
  backdrop-filter: blur(6px);
  color: #fff;
}
.bbi-empty-lb__bar {
  display: flex;
  justify-content: flex-end;
}
.bbi-empty-lb__close {
  width: 38px;
  height: 38px;
  border: 1px solid oklch(1 0 0 / 0.18);
  border-radius: var(--bbi-radius-pill);
  background: oklch(1 0 0 / 0.1);
  color: oklch(1 0 0 / 0.92);
  font-size: 16px;
  cursor: pointer;
}
.bbi-empty-lb__body {
  margin: auto;
  max-width: min(520px, calc(100% - 100px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.bbi-empty-lb__title {
  margin: 0;
  font-size: 13px;
  opacity: 0.75;
}
.bbi-empty-lb__state {
  margin: 0;
  font-size: 18px;
}
.bbi-empty-lb__error {
  margin: 0;
  font-size: 12px;
  color: oklch(0.75 0.15 30);
  word-break: break-all;
}
.bbi-empty-lb__btn {
  padding: 8px 22px;
  border: 1px solid oklch(1 0 0 / 0.5);
  border-radius: var(--bbi-radius-pill);
  background: transparent;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.bbi-empty-lb__btn.is-main {
  border-color: var(--bbi-accent);
  background: var(--bbi-accent);
}
.bbi-empty-lb__prompt {
  margin: 0;
  max-height: 30vh;
  overflow-y: auto;
  font-size: 12px;
  opacity: 0.7;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
