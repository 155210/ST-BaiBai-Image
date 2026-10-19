<script setup lang="ts">
/**
 * 重型自定义提示词:导入酒馆预设,条目可开关、拖动排序、编辑身份/位置/内容。
 * 运行时怎么用见 autoTag/heavyPreset.ts 文件头;这里只管编辑 settings.autoTag.heavyPreset。
 *
 * 拖动用 Pointer Events 而非 HTML5 拖放:安卓/iOS 的触摸不会触发 dragstart,
 * 抓手上设 touch-action:none,按住抓手上下滑即可换位。
 */
import BbiSelect from '@/components/BbiSelect.vue';
import BbiTextarea from '@/components/BbiTextarea.vue';
import Icon from '@/components/Icon.vue';
import ModalMask from '@/components/ModalMask.vue';
import {
  HEAVY_SLOT_ID,
  heavyPresetDefaults,
  parseSTPreset,
  type HeavyEntry,
} from '@/autoTag/heavyPreset';
import { settings } from '@/state/settings';
import { computed, ref } from 'vue';

const preset = computed(() => settings.autoTag.heavyPreset);
const promptCount = computed(() => preset.value.entries.filter(e => e.id !== HEAVY_SLOT_ID).length);
const enabledCount = computed(
  () => preset.value.entries.filter(e => e.id !== HEAVY_SLOT_ID && e.enabled).length,
);

const ROLE_OPTIONS = [
  { value: 'system', label: '系统' },
  { value: 'user', label: '用户' },
  { value: 'assistant', label: 'AI 助手' },
];
const ROLE_LABEL: Record<string, string> = { system: '系统', user: '用户', assistant: 'AI' };
const POSITION_OPTIONS = [
  { value: 'relative', label: '相对' },
  { value: 'depth', label: '聊天中' },
];

function positionLabel(e: HeavyEntry): string {
  return e.position === 'depth' ? `深度 ${e.depth}` : '相对';
}

/* —— 导入 —— */
const fileInput = ref<HTMLInputElement | null>(null);
async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const parsed = parseSTPreset(JSON.parse(await file.text()));
    settings.autoTag.heavyPreset = {
      enabled: preset.value.enabled,
      name: file.name.replace(/\.json$/i, ''),
      entries: parsed.entries,
      squash: parsed.squash,
    };
    const notes = [
      `已导入 ${parsed.promptCount} 个条目(启用 ${parsed.enabledCount})`,
      parsed.droppedMarkers ? `丢弃角色卡/世界书等占位 ${parsed.droppedMarkers} 个` : '',
      parsed.hadChatHistory ? '' : '预设里没有聊天记录,柏宝绘提示词放在了末尾',
    ].filter(Boolean);
    toastr.success(notes.join(';'), '柏宝绘');
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error), '导入预设失败');
  }
}

function clearPreset(): void {
  settings.autoTag.heavyPreset = { ...heavyPresetDefaults(), enabled: preset.value.enabled };
}

/* —— 拖动排序 —— */
const listEl = ref<HTMLElement | null>(null);
const dragId = ref<string | null>(null);

function onHandleDown(event: PointerEvent, id: string): void {
  if (event.button !== 0) return;
  event.preventDefault();
  dragId.value = id;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onHandleMove(event: PointerEvent): void {
  if (!dragId.value || !listEl.value) return;
  const entries = preset.value.entries;
  const from = entries.findIndex(e => e.id === dragId.value);
  if (from < 0) return;
  const rows = Array.from(listEl.value.children) as HTMLElement[];
  let to = from;
  // 指针越过相邻行的中线才换位,避免在两行交界处来回抖
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (i < from && event.clientY < mid) {
      to = i;
      break;
    }
    if (i > from && event.clientY > mid) to = i;
  }
  if (to !== from) {
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
  }
}

function onHandleUp(): void {
  dragId.value = null;
}

/* —— 编辑 —— */
const editing = ref<HeavyEntry | null>(null);
const draft = ref<HeavyEntry | null>(null);

function openEdit(entry: HeavyEntry): void {
  editing.value = entry;
  draft.value = { ...entry };
}
function closeEdit(): void {
  editing.value = null;
  draft.value = null;
}
function saveEdit(): void {
  if (editing.value && draft.value) {
    const d = draft.value;
    Object.assign(editing.value, {
      ...d,
      name: d.name.trim() || editing.value.name,
      depth: Math.max(0, Math.floor(Number(d.depth)) || 0),
      order: Math.floor(Number(d.order)) || 0,
    });
  }
  closeEdit();
}
function removeEditing(): void {
  const entry = editing.value;
  if (!entry || entry.id === HEAVY_SLOT_ID) return;
  const entries = preset.value.entries;
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
  closeEdit();
}

function addEntry(): void {
  const entry: HeavyEntry = {
    id: `bbi-custom-${Date.now().toString(36)}`,
    name: '新条目',
    role: 'system',
    content: '',
    enabled: true,
    position: 'relative',
    depth: 4,
    order: 100,
  };
  preset.value.entries.push(entry);
  openEdit(entry);
}
</script>

<template>
  <label class="bbi-switch-row">
    <span class="bbi-field-label">解析失败时改用重型提示词</span>
    <input v-model="settings.autoTag.heavyPreset.enabled" type="checkbox" class="bbi-checkbox" />
  </label>
  <p class="bbi-field-hint">
    每楼先用「自定义提示词」请求;返回解析失败后,剩下的自动重试改用这里导入的酒馆预设,下一楼重新从默认开始。
    条目按各自的身份、位置(相对 / 聊天中深度)和顺序拼装,「柏宝绘提示词」条目就是默认提示词整条,
    相当于预设里聊天记录的位置。
    <strong v-if="settings.autoTag.retryCount === 0">当前失败自动重试次数为 0,只会用默认提示词。</strong>
  </p>

  <div class="bbi-heavy-bar">
    <span class="bbi-field-label bbi-heavy-title">
      {{ preset.name || '未导入预设' }}
      <span v-if="promptCount" class="bbi-heavy-count">已启用 {{ enabledCount }}/{{ promptCount }}</span>
    </span>
    <button class="bbi-btn bbi-btn-primary bbi-btn-sm" type="button" @click="fileInput?.click()">
      <Icon name="upload" /> 导入预设
    </button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImport" />
  </div>
  <p class="bbi-field-hint">
    支持酒馆导出的聊天补全预设 JSON。角色卡、世界书、示例对话等占位条目不导入(柏宝绘的默认提示词已自带);
    按住左侧抓手上下拖动调整顺序。
  </p>

  <ul ref="listEl" class="bbi-heavy-list">
    <li
      v-for="entry in preset.entries"
      :key="entry.id"
      class="bbi-heavy-row"
      :class="{
        'is-slot': entry.id === HEAVY_SLOT_ID,
        'is-off': entry.id !== HEAVY_SLOT_ID && !entry.enabled,
        'is-dragging': dragId === entry.id,
      }"
    >
      <span
        class="bbi-heavy-handle"
        title="拖动排序"
        @pointerdown="onHandleDown($event, entry.id)"
        @pointermove="onHandleMove"
        @pointerup="onHandleUp"
        @pointercancel="onHandleUp"
      >
        <Icon name="text" />
      </span>
      <input
        v-if="entry.id !== HEAVY_SLOT_ID"
        v-model="entry.enabled"
        type="checkbox"
        class="bbi-checkbox"
        :title="entry.enabled ? '关闭此条目' : '启用此条目'"
      />
      <span v-else class="bbi-heavy-slot-mark"><Icon name="pin" /></span>
      <button class="bbi-heavy-open" type="button" @click="entry.id !== HEAVY_SLOT_ID && openEdit(entry)">
        <span class="bbi-heavy-name">{{ entry.name }}</span>
        <span v-if="entry.id !== HEAVY_SLOT_ID" class="bbi-heavy-tag">{{ ROLE_LABEL[entry.role] }}</span>
        <span
          v-if="entry.id !== HEAVY_SLOT_ID"
          class="bbi-heavy-tag"
          :class="{ 'is-depth': entry.position === 'depth' }"
          >{{ positionLabel(entry) }}</span
        >
      </button>
    </li>
  </ul>

  <div class="bbi-heavy-actions">
    <button class="bbi-btn bbi-btn-sm" type="button" @click="addEntry"><Icon name="plus" /> 新建条目</button>
    <button v-if="promptCount" class="bbi-btn bbi-btn-danger bbi-btn-sm" type="button" @click="clearPreset">
      <Icon name="trash" /> 清空预设
    </button>
  </div>

  <ModalMask :open="!!draft" @close="closeEdit">
    <div v-if="draft" class="bbi-modal bbi-modal-wide" role="dialog" aria-modal="true" aria-label="编辑预设条目">
      <header class="bbi-modal-head">
        <span class="bbi-modal-title">编辑条目</span>
        <button class="bbi-icon-mini" type="button" title="关闭" @click="closeEdit"><Icon name="close" /></button>
      </header>

      <label class="bbi-modal-field">
        <span class="bbi-modal-label">名称</span>
        <input v-model="draft.name" class="bbi-input" type="text" />
      </label>
      <div class="bbi-select-row">
        <span class="bbi-field-label">身份</span>
        <BbiSelect v-model="draft.role" :options="ROLE_OPTIONS" aria-label="身份" />
      </div>
      <div class="bbi-select-row">
        <span class="bbi-field-label">位置</span>
        <BbiSelect v-model="draft.position" :options="POSITION_OPTIONS" aria-label="位置" />
      </div>
      <template v-if="draft.position === 'depth'">
        <label class="bbi-num-row">
          <span class="bbi-field-label">深度</span>
          <input v-model.number="draft.depth" class="bbi-input bbi-num" type="number" min="0" step="1" />
        </label>
        <label class="bbi-num-row">
          <span class="bbi-field-label">顺序</span>
          <input v-model.number="draft.order" class="bbi-input bbi-num" type="number" step="1" />
        </label>
        <p class="bbi-field-hint">深度 0 插在默认提示词消息链末尾,深度 N 插在倒数第 N 条之前;同深度按顺序从小到大。</p>
      </template>

      <BbiTextarea v-model="draft.content" :rows="10" :max-rows="24" placeholder="要发送的提示词。" />

      <footer class="bbi-modal-foot">
        <button class="bbi-btn bbi-btn-danger" type="button" @click="removeEditing"><Icon name="trash" /> 删除</button>
        <span class="bbi-modal-foot-spacer"></span>
        <button class="bbi-btn" type="button" @click="closeEdit">取消</button>
        <button class="bbi-btn bbi-btn-primary" type="button" @click="saveEdit">完成</button>
      </footer>
    </div>
  </ModalMask>
</template>

<style scoped>
.bbi-heavy-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0 8px;
}
.bbi-heavy-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bbi-heavy-count {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--bbi-ink-muted);
}
.bbi-heavy-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bbi-heavy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border: 1px solid var(--bbi-line);
  border-radius: var(--bbi-radius);
  background: var(--bbi-surface-2);
}
.bbi-heavy-row.is-slot {
  border-color: var(--bbi-accent);
  background: var(--bbi-accent-soft);
}
.bbi-heavy-row.is-off .bbi-heavy-open {
  opacity: 0.5;
}
.bbi-heavy-row.is-dragging {
  border-color: var(--bbi-accent);
  box-shadow: 0 2px 8px oklch(0 0 0 / 0.25);
}
/* 触屏手指够得着:抓手 36px 见方;touch-action:none 让按住滑动不去滚页面 */
.bbi-heavy-handle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--bbi-ink-muted);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.bbi-heavy-row.is-dragging .bbi-heavy-handle {
  cursor: grabbing;
  color: var(--bbi-accent);
}
.bbi-heavy-slot-mark {
  flex: 0 0 auto;
  width: 18px;
  display: inline-flex;
  justify-content: center;
  color: var(--bbi-accent);
}
.bbi-heavy-open {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bbi-heavy-row.is-slot .bbi-heavy-open {
  cursor: default;
}
.bbi-heavy-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.bbi-heavy-tag {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--bbi-radius-pill);
  color: var(--bbi-ink-muted);
  border: 1px solid var(--bbi-line);
}
.bbi-heavy-tag.is-depth {
  color: var(--bbi-accent);
  border-color: var(--bbi-accent);
}
.bbi-heavy-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
