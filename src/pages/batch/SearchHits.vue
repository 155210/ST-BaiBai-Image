<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';

import { jumpToFloor } from '@/batch/gallery';
import { setRangeFrom } from '@/batch/rangeStore';

/**
 * 角色搜索的一组结果:楼号全部列出,默认只露两行,超出才给「展开 / 收起」。
 */

const props = defineProps<{
  title: string;
  floors: number[];
  /** 一楼都没有时的说法。 */
  none?: string;
}>();

const open = ref(false);
const overflow = ref(false);
const chips = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);

async function measure(): Promise<void> {
  open.value = false;
  await nextTick();
  const el = chips.value;
  overflow.value = !!el && el.scrollHeight > el.clientHeight + 2;
}

onMounted(measure);
watch(() => props.floors, measure);

function toggle(): void {
  open.value = !open.value;
  if (!open.value) root.value?.scrollIntoView({ block: 'nearest' });
}

function setRange(floor: number): void {
  const text = setRangeFrom(floor);
  toastr.success(`楼层范围已设为 ${text}`, '柏宝绘');
}
</script>

<template>
  <div ref="root" class="bbi-hits">
    <div class="bbi-hits-title">
      <span class="bbi-hits-name">{{ title }}</span>
      <span v-if="floors.length" class="bbi-hits-sub">首次 #{{ floors[0] }} · 共 {{ floors.length }} 楼</span>
    </div>
    <p v-if="!floors.length" class="bbi-field-hint">{{ none ?? '没有出现过' }}</p>
    <template v-else>
      <div ref="chips" class="bbi-hits-chips" :data-open="open ? '1' : ''">
        <button
          v-for="floor in floors"
          :key="floor"
          class="bbi-hits-chip"
          type="button"
          title="定位到这一楼"
          @click="jumpToFloor(floor)"
        >
          #{{ floor }}
        </button>
      </div>
      <button v-if="overflow" class="bbi-hits-toggle" type="button" @click="toggle">
        {{ open ? '收起 ▴' : `展开全部 ${floors.length} 楼 ▾` }}
      </button>
      <div class="bbi-hits-actions">
        <button class="bbi-btn bbi-btn-sm" type="button" @click="jumpToFloor(floors[0])">定位首次出现</button>
        <button class="bbi-btn bbi-btn-sm" type="button" @click="setRange(floors[0])">从这楼起设为范围</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bbi-hits {
  padding: 12px 0;
  border-bottom: 1px solid var(--bbi-line);
}
.bbi-hits-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-bottom: 8px;
}
.bbi-hits-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--bbi-ink);
  word-break: break-all;
}
.bbi-hits-sub {
  font-size: 12px;
  color: var(--bbi-ink-soft);
}
/* 两行 = 2 × (chip 高 26 + 间距 6) */
.bbi-hits-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 58px;
  overflow: hidden;
}
.bbi-hits-chips[data-open='1'] {
  max-height: none;
}
.bbi-hits-chip {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--bbi-line-strong);
  border-radius: var(--bbi-radius-pill);
  background: var(--bbi-surface);
  color: var(--bbi-ink);
  font-family: var(--bbi-font-mono);
  font-size: 12px;
  cursor: pointer;
}
.bbi-hits-chip:hover {
  border-color: var(--bbi-accent);
  color: var(--bbi-accent);
}
.bbi-hits-toggle {
  margin-top: 6px;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--bbi-accent);
  font-size: 12px;
  cursor: pointer;
}
.bbi-hits-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
</style>
