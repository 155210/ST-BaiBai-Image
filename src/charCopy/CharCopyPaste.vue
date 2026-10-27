<script setup lang="ts">
import { ref } from 'vue';

import BbiTextarea from '@/components/BbiTextarea.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Icon from '@/components/Icon.vue';
import { copyText } from '@/st/clipboard';

import { formatCharForCopy, parseCharPaste, pasteKeyLabel, type CharCopyKey, type CharCopySource } from './format';

/**
 * 编辑角色弹窗里的「复制外貌 / 粘贴回填」(本 fork 独有,格式见 format.ts)。
 * 回填只改弹窗里的草稿,用户看过再点「完成」保存。
 */
const props = defineProps<{ source: CharCopySource }>();

const emit = defineEmits<{ (e: 'apply', values: Partial<Record<CharCopyKey, string>>): void }>();

const pasteOpen = ref(false);
const pasteText = ref('');

function copy(): void {
  void copyText(formatCharForCopy(props.source), '已复制外貌，发给识图 AI 检查后整段复制回来点「粘贴回填」');
}

async function openPaste(): Promise<void> {
  pasteText.value = '';
  pasteOpen.value = true;
  // 局域网 HTTP 打开时读不了剪贴板,用户自己在框里粘贴
  try {
    if (window.isSecureContext && navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text && !pasteText.value) pasteText.value = text;
    }
  } catch {
    /* 没给权限就让用户手动粘贴 */
  }
}

function apply(): void {
  const { values, name } = parseCharPaste(pasteText.value);
  const keys = Object.keys(values) as CharCopyKey[];
  if (!keys.length) {
    toastr.warning('没认出任何栏目。要保留「【头发】…」这样的栏目名再贴回来', '柏宝绘');
    return;
  }
  emit('apply', values);
  pasteOpen.value = false;
  const nameNote = name && name !== props.source.name.trim() ? `（贴的是「${name}」，角色名没改）` : '';
  toastr.success(
    `已填回 ${keys.length} 栏：${keys.map(pasteKeyLabel).join('、')}${nameNote}。看一下没问题点「完成」保存`,
    '柏宝绘',
  );
}
</script>

<template>
  <div class="bbi-char-copy">
    <button
      class="bbi-btn bbi-btn-sm"
      type="button"
      title="把外貌 tag 和自然语言外貌按栏目复制出来，可以发给识图 AI 对照图片检查修改"
      @click="copy"
    >
      <Icon name="copy" /> 复制外貌
    </button>
    <button
      class="bbi-btn bbi-btn-sm"
      type="button"
      title="把改好的那段贴回来，按栏目自动填进对应的框"
      @click="openPaste"
    >
      <Icon name="edit" /> 粘贴回填
    </button>
  </div>

  <ConfirmDialog
    v-model:open="pasteOpen"
    title="粘贴回填外貌"
    confirm-text="填进去"
    top-layer
    @confirm="apply"
  >
    把识图 AI 改好的整段贴到下面。按「【头发】…」这样的栏目名填回对应的框；没写到的栏不动，写「无」的栏清空。
    <BbiTextarea
      v-model="pasteText"
      class="bbi-char-copy__input"
      :rows="8"
      :max-rows="14"
      mono
      placeholder="【性别】1girl&#10;【头发】long black hair&#10;……&#10;【自然语言外貌】A petite girl with …"
    />
  </ConfirmDialog>
</template>

<style scoped>
.bbi-char-copy {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.bbi-char-copy__input {
  display: block;
  width: 100%;
  margin-top: 8px;
}
</style>
