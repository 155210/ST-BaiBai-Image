<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import type { LightboxNav } from './types';

/**
 * 灯箱上的切换与操作(本 fork 新增,挂在作者的 Lightbox.vue 里)。
 * - 两侧大箭头:切到上一张 / 下一张卡片(电脑上 ← →);
 * - 左上角一列:是第几张卡片、同一张的历史 roll 小箭头(‹ 第 2/5 次 ›)、重新生成、「⋯」里收着删除。
 * 只用 click,不监听触摸,不影响长按保存图片。
 */

const props = defineProps<{ nav: LightboxNav }>();
const menuOpen = ref(false);

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
    title="上一张卡片 (←)"
    aria-label="上一张卡片"
    @click.stop="nav.prev()"
  >
    ‹
  </button>
  <button
    v-if="nav.next"
    class="bbi-lbnav bbi-lbnav--next"
    type="button"
    title="下一张卡片 (→)"
    aria-label="下一张卡片"
    @click.stop="nav.next()"
  >
    ›
  </button>
  <div class="bbi-lbnav-panel" @click.stop>
    <span v-if="nav.label" class="bbi-lbnav-label">{{ nav.label }}</span>
    <span v-if="nav.rolls && nav.rolls.total > 1" class="bbi-lbnav-rolls" title="同一张卡片出过的几次图">
      <button type="button" aria-label="这张卡片的上一次" :disabled="!nav.rolls.prev" @click="nav.rolls.prev?.()">‹</button>
      <span>第 {{ nav.rolls.index + 1 }}/{{ nav.rolls.total }} 次</span>
      <button type="button" aria-label="这张卡片的下一次" :disabled="!nav.rolls.next" @click="nav.rolls.next?.()">›</button>
    </span>
    <span class="bbi-lbnav-row">
      <button v-if="nav.regenerate" class="bbi-lbnav-pill is-accent" type="button" title="按现在的提示词重新出一张" @click="nav.regenerate()">
        ↻ 重新生成
      </button>
      <button
        v-if="nav.menu?.length"
        class="bbi-lbnav-pill"
        type="button"
        :aria-expanded="menuOpen"
        title="更多操作"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? '收起 ▴' : '⋯' }}
      </button>
    </span>
    <span v-if="menuOpen && nav.menu?.length" class="bbi-lbnav-row">
      <button
        v-for="item in nav.menu"
        :key="item.label"
        class="bbi-lbnav-pill"
        :class="{ 'is-danger': item.danger }"
        type="button"
        @click="item.action()"
      >
        {{ item.label }}
      </button>
    </span>
  </div>
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
.bbi-lbnav-panel {
  position: fixed;
  top: 20px;
  left: 16px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: calc(100% - 140px);
}
.bbi-lbnav-label,
.bbi-lbnav-rolls {
  padding: 4px 10px;
  border-radius: var(--bbi-radius-pill);
  background: oklch(0 0 0 / 0.5);
  color: #fff;
  font-size: 13px;
}
.bbi-lbnav-rolls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
}
.bbi-lbnav-rolls button {
  width: 30px;
  height: 28px;
  border: 1px solid oklch(1 0 0 / 0.3);
  border-radius: var(--bbi-radius-pill);
  background: transparent;
  color: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.bbi-lbnav-rolls button:disabled {
  opacity: 0.3;
  cursor: default;
}
.bbi-lbnav-row {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bbi-lbnav-pill {
  padding: 6px 14px;
  border: 1px solid oklch(1 0 0 / 0.35);
  border-radius: var(--bbi-radius-pill);
  background: oklch(0 0 0 / 0.55);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.bbi-lbnav-pill.is-accent {
  border-color: var(--bbi-accent);
}
.bbi-lbnav-pill.is-danger {
  border-color: var(--bbi-danger);
  background: var(--bbi-danger);
}
</style>
