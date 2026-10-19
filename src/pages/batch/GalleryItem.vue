<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  busyLabel,
  deleteSlotImage,
  jumpToFloor,
  readSlot,
  regenerateSlot,
  type GallerySize,
  type GallerySlot,
} from '@/batch/gallery';
import { effectiveOrientation } from '@/backends/size';
import { cancelGen, getGenRecord, slotKey } from '@/floor/genState';
import { confirmImageMissing } from '@/floor/missingImages';
import { openPromptEditor } from '@/floor/promptEditor';
import type { BbiImageEntry } from '@/floor/storage';
import { backendStatus } from '@/generate';
import { activeOrientationLock } from '@/state/settings';
import { getContext } from '@/st/context';

/**
 * 图片浏览里的一张卡片(一个 tag 槽位)。数据每次现读(chat 不是响应式的,靠 tick 重算),
 * 运行态(生成中 / 失败)读 genState,与楼层卡片同一份。
 */

const props = defineProps<{
  slot: GallerySlot;
  chatId: string;
  size: GallerySize;
  /** 定时 +1,让卡片跟上聊天数据的变化。 */
  tick: number;
}>();
/** 点开大图:交给图片浏览打开灯箱,好在卡片之间左右切换。 */
const emit = defineEmits<{ open: [entry: BbiImageEntry] }>();

const view = computed(() => {
  void props.tick;
  const chat = getContext()?.chat;
  return chat ? readSlot(chat, props.slot) : null;
});

const key = computed(() =>
  view.value ? slotKey(props.chatId, view.value.floor, view.value.swipeId, view.value.seq) : '',
);
const record = computed(() => (key.value ? getGenRecord(key.value) : undefined));
const busy = computed(() => record.value?.phase === 'queued' || record.value?.phase === 'generating');
const failed = computed(() => record.value?.phase === 'error');

/** 翻历史的位置:默认最新一张,有新图落盘就跟到最新。 */
const index = ref(Math.max(0, (view.value?.history.length ?? 1) - 1));
watch(
  () => view.value?.history.length ?? 0,
  length => {
    index.value = Math.max(0, length - 1);
  },
);

const shown = computed(() => {
  const current = view.value;
  if (!current) return null;
  return current.history[Math.min(index.value, current.history.length - 1)] ?? current.stale;
});

const orientation = computed(() =>
  view.value ? effectiveOrientation(activeOrientationLock(), view.value.content.size) : 'portrait',
);

const compact = computed(() => props.size !== 'l');

const badge = computed(() => {
  const current = view.value;
  if (!current) return '';
  const parts = [`#${current.floor}`];
  if (current.seq) parts.push(`第${current.seq + 1}张`);
  if (failed.value) parts.push('失败');
  else if (current.state === 'stale') parts.push('旧提示词');
  return parts.join(' · ');
});

const busyText = computed(() => busyLabel(record.value));

function openImage(): void {
  const entry = shown.value;
  if (entry) emit('open', entry);
}

function roll(): void {
  if (busy.value) return;
  void regenerateSlot(props.slot.floor, props.slot.seq);
}

function edit(): void {
  const current = view.value;
  if (!current || busy.value) return;
  const { floor, seq } = current;
  openPromptEditor({
    at: { chatId: props.chatId, messageId: floor, swipeId: current.swipeId, seq, rawTag: current.tag },
    content: {
      ...current.content,
      characters: current.content.characters.map(character => ({ ...character })),
    },
    historyCount: current.history.length,
    configured: backendStatus().configured,
    regenerate: () => void regenerateSlot(floor, seq),
  });
}

/** 「⋯」收着的二级操作:删掉卡片上正显示的这一次 roll,其它次不动。 */
const menuOpen = ref(false);
const deleteLabel = computed(() => {
  const total = view.value?.history.length ?? 0;
  return total > 1 ? `删除这一次（第 ${Math.min(index.value, total - 1) + 1}/${total} 次）` : '删除这张图';
});

function removeShown(): void {
  const current = view.value;
  const entry = shown.value;
  if (!current || !entry || busy.value) return;
  menuOpen.value = false;
  void deleteSlotImage(current.floor, current.swipeId, entry);
}

function cancel(): void {
  if (key.value) cancelGen(key.value);
}

function onImageError(): void {
  const path = shown.value?.path;
  if (path) void confirmImageMissing(path);
}
</script>

<template>
  <div v-if="view" class="bbi-gitem" :data-size="size">
    <div class="bbi-gitem-pic" :data-orientation="orientation">
      <img v-if="shown" :src="shown.path" loading="lazy" alt="" @click="openImage" @error="onImageError" />
      <div v-else class="bbi-gitem-none">还没有图<br />点「{{ compact ? '↻' : '重roll' }}」生成</div>
      <span class="bbi-gitem-badge" :data-warn="failed || view.state === 'stale' ? '1' : ''">{{ badge }}</span>
      <div v-if="busy" class="bbi-gitem-busy">
        <span>{{ busyText }}</span>
        <button type="button" @click="cancel">取消</button>
      </div>
    </div>
    <p v-if="failed && !compact" class="bbi-gitem-error">{{ record?.error || '生成失败' }}</p>
    <div class="bbi-gitem-bar">
      <template v-if="view.history.length > 1">
        <button type="button" title="上一张" :disabled="busy || index <= 0" @click="index--">◀</button>
        <span class="bbi-gitem-count">{{ index + 1 }}/{{ view.history.length }}</span>
        <button type="button" title="下一张" :disabled="busy || index >= view.history.length - 1" @click="index++">
          ▶
        </button>
      </template>
      <span class="bbi-gitem-gap" />
      <button class="is-main" type="button" title="重roll" :disabled="busy" @click="roll">
        {{ compact ? '↻' : '重roll' }}
      </button>
      <button type="button" title="编辑提示词" :disabled="busy" @click="edit">{{ compact ? '✎' : '编辑' }}</button>
      <button type="button" title="定位到楼层" @click="jumpToFloor(view.floor)">{{ compact ? '⌖' : '定位' }}</button>
      <button
        v-if="shown"
        type="button"
        :title="menuOpen ? '收起' : '更多操作'"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? '▴' : '⋯' }}
      </button>
    </div>
    <div v-if="menuOpen && shown" class="bbi-gitem-menu">
      <button class="is-danger" type="button" :disabled="busy" @click="removeShown">{{ deleteLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.bbi-gitem {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--bbi-line);
  border-radius: var(--bbi-radius);
  background: var(--bbi-surface);
  overflow: hidden;
}
.bbi-gitem-pic {
  position: relative;
  aspect-ratio: 2 / 3;
  background: var(--bbi-surface-2);
}
.bbi-gitem-pic[data-orientation='landscape'] {
  aspect-ratio: 3 / 2;
}
.bbi-gitem-pic img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: zoom-in;
}
.bbi-gitem-none {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12px;
  color: var(--bbi-ink-soft);
  padding: 8px;
}
.bbi-gitem-badge {
  position: absolute;
  left: 6px;
  top: 6px;
  max-width: calc(100% - 12px);
  padding: 2px 7px;
  border-radius: var(--bbi-radius-pill);
  background: oklch(0 0 0 / 0.55);
  color: #fff;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bbi-gitem-badge[data-warn='1'] {
  background: oklch(0.55 0.15 50 / 0.85);
}
.bbi-gitem-busy {
  position: absolute;
  inset: 0;
  /* 生成中也能点图看大图(大图左上会显示进度);只有「取消」接点击 */
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: oklch(0 0 0 / 0.45);
  color: #fff;
  font-size: 12px;
}
.bbi-gitem-busy button {
  pointer-events: auto;
  padding: 3px 12px;
  border: 1px solid oklch(1 0 0 / 0.6);
  border-radius: var(--bbi-radius-pill);
  background: transparent;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}
.bbi-gitem-error {
  margin: 0;
  padding: 6px 8px 0;
  font-size: 12px;
  color: var(--bbi-danger);
  word-break: break-all;
}
.bbi-gitem-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
}
.bbi-gitem-gap {
  flex: 1 1 auto;
}
.bbi-gitem-bar button {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--bbi-line-strong);
  border-radius: var(--bbi-radius-sm);
  background: var(--bbi-surface);
  color: var(--bbi-ink);
  font-size: 13px;
  cursor: pointer;
}
.bbi-gitem-bar button.is-main {
  border-color: var(--bbi-accent);
  color: var(--bbi-accent);
}
.bbi-gitem-bar button:disabled {
  opacity: 0.45;
  cursor: default;
}
.bbi-gitem[data-size='s'] .bbi-gitem-bar {
  flex-wrap: wrap;
  gap: 3px;
  padding: 4px;
}
.bbi-gitem[data-size='s'] .bbi-gitem-bar button {
  min-width: 24px;
  height: 26px;
  padding: 0 4px;
  font-size: 12px;
}
.bbi-gitem-menu {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 6px 6px;
}
.bbi-gitem-menu button {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--bbi-line-strong);
  border-radius: var(--bbi-radius-sm);
  background: var(--bbi-surface);
  font-size: 12px;
  cursor: pointer;
}
.bbi-gitem-menu button.is-danger {
  border-color: var(--bbi-danger);
  color: var(--bbi-danger);
}
.bbi-gitem-menu button:disabled {
  opacity: 0.45;
  cursor: default;
}
.bbi-gitem-count {
  font-family: var(--bbi-font-mono);
  font-size: 11px;
  color: var(--bbi-ink-soft);
}
</style>
