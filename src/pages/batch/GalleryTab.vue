<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

import BbiSelect from '@/components/BbiSelect.vue';
import { confirmDialog } from '@/components/confirm';
import { batchBlocker, batchState, startBatch } from '@/batch/controller';
import {
  checkSlotFiles,
  filterSlots,
  GALLERY_SIZES,
  listSlots,
  type GalleryFilter,
  type GallerySize,
  type GallerySlot,
} from '@/batch/gallery';
import { parseFloorRange } from '@/batch/range';
import { batchRange } from '@/batch/rangeStore';
import { getContext } from '@/st/context';
import GalleryItem from './GalleryItem.vue';

/**
 * 批量页「图片浏览」:按楼层范围翻看每个 tag 的图。逻辑在 batch/gallery.ts。
 * 筛选、顺序、大小记在浏览器本地,不进插件设置。
 */

const props = defineProps<{ chatTick: number }>();
const emit = defineEmits<{ goRun: [] }>();

const PREFS_KEY = 'bbi_batch_gallery_prefs';
const FILTERS: { value: GalleryFilter; label: string }[] = [
  { value: 'all', label: '全部卡片' },
  { value: 'has', label: '只看有图' },
  { value: 'none', label: '只看没图' },
  { value: 'stale', label: '只看旧提示词' },
];

interface Prefs {
  filter: GalleryFilter;
  reverse: boolean;
  size: GallerySize;
}

function readPrefs(): Prefs {
  const fallback: Prefs = { filter: 'all', reverse: false, size: 'l' };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      filter: FILTERS.some(item => item.value === saved.filter) ? saved.filter! : fallback.filter,
      reverse: saved.reverse === true,
      size: saved.size && saved.size in GALLERY_SIZES ? saved.size : fallback.size,
    };
  } catch {
    return fallback;
  }
}

const prefs = ref<Prefs>(readPrefs());
watch(
  prefs,
  value => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    } catch {
      /* 记不住就算了 */
    }
  },
  { deep: true },
);

const slots = shallowRef<GallerySlot[]>([]);
const chatId = ref('');
const page = ref(0);
const loading = ref(false);
const error = ref('');
const note = ref('');
/** chat 不是响应式的:定时 +1,让列表与卡片跟上出图、编辑、删除。 */
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

async function load(): Promise<void> {
  const context = getContext();
  const chat = context?.chat;
  error.value = '';
  note.value = '';
  if (!chat || !context.getCurrentChatId()) {
    slots.value = [];
    error.value = '先打开一个聊天';
    return;
  }
  let floors: number[];
  try {
    floors = parseFloorRange(batchRange.text, chat.length - 1);
  } catch (reason) {
    slots.value = [];
    error.value = reason instanceof Error ? reason.message : String(reason);
    return;
  }
  chatId.value = context.getCurrentChatId() ?? '';
  slots.value = listSlots(chat, floors);
  page.value = 0;
  loading.value = true;
  try {
    const gone = await checkSlotFiles(chat, slots.value);
    if (gone) note.value = `有 ${gone} 张图的文件已经被删了（多半是在图库里删的），这些按「没图」算。`;
  } finally {
    loading.value = false;
    tick.value++;
  }
}

const list = computed(() => {
  void tick.value;
  const chat = getContext()?.chat ?? [];
  return filterSlots(chat, slots.value, prefs.value.filter, prefs.value.reverse);
});

const perPage = computed(() => GALLERY_SIZES[prefs.value.size].page);
const pages = computed(() => Math.max(1, Math.ceil(list.value.length / perPage.value)));
const pageSlots = computed(() => {
  const at = Math.min(page.value, pages.value - 1);
  return list.value.slice(at * perPage.value, (at + 1) * perPage.value);
});
const pageInput = ref('1');
watch([page, pages], () => {
  if (page.value > pages.value - 1) page.value = pages.value - 1;
  pageInput.value = String(page.value + 1);
});

const top = ref<HTMLElement | null>(null);

function goto(target: number): void {
  page.value = Math.max(0, Math.min(pages.value - 1, target));
  pageInput.value = String(page.value + 1);
  top.value?.scrollIntoView({ block: 'start' });
}

function jumpInput(): void {
  const target = Math.floor(Number(pageInput.value));
  if (target >= 1) goto(target - 1);
  else pageInput.value = String(page.value + 1);
}

function setSize(size: GallerySize): void {
  // 换档时尽量停在同一批图附近
  const first = page.value * perPage.value;
  prefs.value.size = size;
  page.value = Math.floor(first / GALLERY_SIZES[size].page);
}

function toggleReverse(): void {
  prefs.value.reverse = !prefs.value.reverse;
  page.value = 0;
}

watch(
  () => prefs.value.filter,
  () => {
    page.value = 0;
  },
);

/** 只看没图 / 只看旧提示词时,一键把这些交给批量出图。 */
const bulk = computed(() => {
  const filter = prefs.value.filter;
  if ((filter !== 'none' && filter !== 'stale') || !list.value.length) return null;
  return {
    mode: filter,
    floors: [...new Set(list.value.map(slot => slot.floor))].sort((a, b) => a - b),
    label: filter === 'stale' ? `这 ${list.value.length} 张全部按新提示词重出` : `这 ${list.value.length} 张全部出图`,
  };
});

function gapMs(): number {
  try {
    const seconds = Number(localStorage.getItem('bbi_batch_image_gap_seconds') ?? '3');
    return Math.round(Math.min(60, Math.max(0, seconds || 0)) * 1000);
  } catch {
    return 3000;
  }
}

async function runBulk(): Promise<void> {
  const plan = bulk.value;
  if (!plan) return;
  const blocker = batchBlocker('image');
  if (blocker) {
    toastr.warning(blocker, '柏宝绘');
    return;
  }
  const ok = await confirmDialog({
    title: '批量出图',
    text:
      `${plan.floors.length} 楼里的 ${list.value.length} 张${plan.mode === 'stale' ? '按新提示词重出' : '出图'}，` +
      `一张一张按顺序出，会消耗出图额度。进度在「批量生成」里看。`,
    confirmText: '开始',
  });
  if (!ok) return;
  startBatch('image', plan.floors, gapMs(), plan.mode);
  emit('goRun');
}

watch(
  () => props.chatTick,
  () => void load(),
);

onMounted(() => {
  void load();
  timer = setInterval(() => tick.value++, 1500);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div ref="top" class="bbi-sections">
    <div class="bbi-gtools">
      <BbiSelect v-model="prefs.filter" :options="FILTERS" class="bbi-gfilter" />
      <button class="bbi-btn bbi-btn-sm" type="button" :disabled="loading" @click="load">刷新列表</button>
      <button class="bbi-btn bbi-btn-sm" type="button" @click="toggleReverse">
        {{ prefs.reverse ? '倒序（新→旧）' : '正序（旧→新）' }}
      </button>
      <div class="bbi-segmented bbi-gsizes" role="tablist" aria-label="图片大小">
        <button
          v-for="(item, size) in GALLERY_SIZES"
          :key="size"
          class="bbi-seg"
          :class="{ 'is-on': prefs.size === size }"
          type="button"
          role="tab"
          :aria-selected="prefs.size === size"
          @click="setSize(size)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <p class="bbi-field-hint" :class="{ 'bbi-gerror': error }">
      <template v-if="error">{{ error }}</template>
      <template v-else-if="loading">检查图片文件…</template>
      <template v-else>共 {{ list.length }} 张卡片 · 第 {{ Math.min(page, pages - 1) + 1 }}/{{ pages }} 页</template>
    </p>
    <p v-if="note" class="bbi-field-hint">{{ note }}</p>

    <button
      v-if="bulk"
      class="bbi-btn bbi-btn-primary"
      type="button"
      :disabled="batchState.running !== null"
      @click="runBulk"
    >
      {{ bulk.label }}
    </button>

    <template v-for="position in ['top', 'bottom']" :key="position">
      <div v-if="list.length > perPage" class="bbi-gpager" :data-position="position">
        <button type="button" title="首页" :disabled="page <= 0" @click="goto(0)">«</button>
        <button type="button" title="上一页" :disabled="page <= 0" @click="goto(page - 1)">‹</button>
        <span class="bbi-gpager-num">
          <input
            v-model="pageInput"
            type="number"
            min="1"
            :max="pages"
            inputmode="numeric"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            @change="jumpInput"
          />
          / {{ pages }}
        </span>
        <button type="button" title="下一页" :disabled="page >= pages - 1" @click="goto(page + 1)">›</button>
        <button type="button" title="尾页" :disabled="page >= pages - 1" @click="goto(pages - 1)">»</button>
      </div>
      <div
        v-if="position === 'top'"
        class="bbi-ggrid"
        :style="{ gridTemplateColumns: `repeat(${GALLERY_SIZES[prefs.size].cols}, minmax(0, 1fr))` }"
      >
        <GalleryItem
          v-for="slot in pageSlots"
          :key="`${slot.floor}:${slot.seq}`"
          :slot="slot"
          :chat-id="chatId"
          :size="prefs.size"
          :tick="tick"
        />
        <p v-if="!pageSlots.length && !loading && !error" class="bbi-field-hint bbi-gempty">
          这个范围里没有卡片。先在上面填楼层范围，再点「刷新列表」。
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bbi-gtools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.bbi-gfilter {
  min-width: 128px;
}
.bbi-gsizes .bbi-seg {
  padding: 6px 12px;
}
.bbi-gerror {
  color: var(--bbi-danger);
}
.bbi-ggrid {
  display: grid;
  gap: 8px;
}
.bbi-gempty {
  grid-column: 1 / -1;
}
.bbi-gpager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.bbi-gpager button {
  min-width: 36px;
  height: 34px;
  border: 1px solid var(--bbi-line-strong);
  border-radius: var(--bbi-radius-sm);
  background: var(--bbi-surface);
  color: var(--bbi-ink);
  font-size: 16px;
  cursor: pointer;
}
.bbi-gpager button:disabled {
  opacity: 0.4;
  cursor: default;
}
.bbi-gpager-num {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--bbi-ink-soft);
}
.bbi-gpager-num input {
  width: 52px;
  height: 32px;
  padding: 0 4px;
  border: 1px solid var(--bbi-line-strong);
  border-radius: var(--bbi-radius-sm);
  background: var(--bbi-surface);
  color: var(--bbi-ink);
  text-align: center;
  font-size: 13px;
}
</style>
