<script setup lang="ts">
import type { ImageContextText } from './before';

/** 大图下面、提示词上面:这张图前面的几段正文(本 fork 新增)。 */
defineProps<{ context: ImageContextText }>();
</script>

<template>
  <div class="bbi-image-context" @click.stop>
    <span class="bbi-image-context__label">图前正文</span>
    <p v-if="context.atStart" class="bbi-image-context__p bbi-image-context__p--muted">这张图在正文开头，前面没有文字。</p>
    <p v-for="(text, i) in context.passages" :key="i" class="bbi-image-context__p">{{ text }}</p>
  </div>
</template>

<style scoped>
.bbi-image-context {
  flex: 0 0 auto;
  max-height: 20%;
  overflow-y: auto;
  padding: 8px 12px;
  border-radius: var(--bbi-radius-sm);
  border-left: 3px solid var(--bbi-accent, oklch(0.75 0.12 70));
  background: oklch(1 0 0 / 0.08);
  color: oklch(1 0 0 / 0.88);
  font-size: 12.5px;
  line-height: 1.6;
  user-select: text;
}

.bbi-image-context__label {
  display: block;
  margin-bottom: 2px;
  font-size: 11px;
  opacity: 0.6;
}

.bbi-image-context__p {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.bbi-image-context__p + .bbi-image-context__p {
  margin-top: 4px;
}

.bbi-image-context__p--muted {
  opacity: 0.6;
}
</style>
