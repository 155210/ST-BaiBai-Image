<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

import type { LightboxNav } from './types';

/**
 * 灯箱两侧的「上一张 / 下一张」箭头(本 fork 新增,挂在作者的 Lightbox.vue 里)。
 * 只用 click,不监听触摸,不影响长按保存图片。电脑上也能按 ← →。
 */

const props = defineProps<{ nav: LightboxNav }>();

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
  const go = event.key === 'ArrowLeft' ? props.nav.prev : event.key === 'ArrowRight' ? props.nav.next : undefined;
  if (!go) return;
  event.preventDefault();
  event.stopPropagation();
  go();
}

onMounted(() => document.addEventListener('keydown', onKeydown, true));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true));
</script>

<template>
  <button
    v-if="nav.prev"
    class="bbi-lbnav bbi-lbnav--prev"
    type="button"
    title="上一张 (←)"
    aria-label="上一张"
    @click.stop="nav.prev()"
  >
    ‹
  </button>
  <button
    v-if="nav.next"
    class="bbi-lbnav bbi-lbnav--next"
    type="button"
    title="下一张 (→)"
    aria-label="下一张"
    @click.stop="nav.next()"
  >
    ›
  </button>
  <span v-if="nav.label" class="bbi-lbnav-label" @click.stop>{{ nav.label }}</span>
  <button v-if="nav.regenerate" class="bbi-lbnav-regen" type="button" title="按现在的提示词重新出一张" @click.stop="nav.regenerate()">
    ↻ 重新生成
  </button>
</template>

<style scoped>
.bbi-lbnav {
  position: fixed;
  top: 50%;
  z-index: 1;
  width: 44px;
  height: 64px;
  margin-top: -32px;
  border: 1px solid oklch(1 0 0 / 0.18);
  border-radius: var(--bbi-radius);
  background: oklch(0 0 0 / 0.45);
  color: oklch(1 0 0 / 0.92);
  font-size: 34px;
  line-height: 1;
  cursor: pointer;
}
.bbi-lbnav:hover {
  background: oklch(0 0 0 / 0.65);
}
.bbi-lbnav--prev {
  left: 6px;
}
.bbi-lbnav--next {
  right: 6px;
}
.bbi-lbnav-label {
  position: fixed;
  top: 24px;
  left: 16px;
  z-index: 1;
  padding: 4px 10px;
  border-radius: var(--bbi-radius-pill);
  background: oklch(0 0 0 / 0.5);
  color: #fff;
  font-size: 13px;
}
.bbi-lbnav-regen {
  position: fixed;
  top: 60px;
  left: 16px;
  z-index: 1;
  padding: 6px 14px;
  border: 1px solid var(--bbi-accent);
  border-radius: var(--bbi-radius-pill);
  background: oklch(0 0 0 / 0.55);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
</style>
