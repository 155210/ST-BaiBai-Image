<script setup lang="ts">
import { ref } from 'vue';

import Collapsible from '@/components/Collapsible.vue';
import { confirmDialog } from '@/components/confirm';
import { applyBackup, buildBackup, downloadBackup, parseBackup } from '@/state/backup';

/**
 * 设置页「导出 / 导入设置」:换手机、换酒馆时把柏宝绘的设置整份带过去。逻辑在 state/backup.ts。
 */

const withKeys = ref(true);
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function exportSettings(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const { backup, missingVibes } = await buildBackup(withKeys.value);
    downloadBackup(backup);
    const vibeNote = missingVibes.length ? `；有 ${missingVibes.length} 个 Vibe 读不到文件，没带上：${missingVibes.join('、')}` : '';
    toastr.success(`已导出，文件在手机的「下载」里${vibeNote}`, '柏宝绘', { timeOut: missingVibes.length ? 0 : 5000 });
  } catch (error) {
    toastr.error(`导出失败：${error instanceof Error ? error.message : String(error)}`, '柏宝绘');
  } finally {
    busy.value = false;
  }
}

function pickFile(): void {
  if (busy.value) return;
  fileInput.value?.click();
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error), '柏宝绘');
    return;
  }
  const from = [backup.pluginVersion && `插件版本 ${backup.pluginVersion}`, backup.exportedAt.slice(0, 10)]
    .filter(Boolean)
    .join('，');
  const ok = await confirmDialog({
    title: '导入设置',
    text:
      `这个文件导出于 ${from || '未知时间'}。\n` +
      '导入后，柏宝绘现在的全部设置和全局角色库会被文件里的替换掉，不能撤销。' +
      (backup.dailyGenStats ? '\n文件里的每日出图计数会和这台设备上的合并（同一天取张数多的）。' : '') +
      (backup.withKeys ? '' : '\n文件里没带 API Key，会保留这台设备上已经填好的 Key。'),
    confirmText: '导入',
    tone: 'danger',
  });
  if (!ok) return;
  busy.value = true;
  try {
    const report = await applyBackup(backup);
    const failed = report.failedVibes.length ? `；${report.failedVibes.length} 个 Vibe 没能写回：${report.failedVibes.join('、')}` : '';
    const stats = report.statDays ? `，出图计数 ${report.statDays} 天` : '';
    toastr.success(`已导入：全局角色 ${report.characters} 个，Vibe ${report.vibes} 个${stats}${failed}`, '柏宝绘', {
      timeOut: failed ? 0 : 6000,
    });
  } catch (error) {
    toastr.error(`导入失败：${error instanceof Error ? error.message : String(error)}`, '柏宝绘');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Collapsible title="导出 / 导入设置" :open="false">
    <p class="bbi-field-hint">
      换手机或者重装酒馆时用：先在旧设备点「导出设置」，把文件传到新设备，再在新设备点「导入设置」。
      同一个酒馆换设备打开本来就会自动同步，不用导。
    </p>
    <p class="bbi-field-hint">
      会带上：出图渠道和接入点、正负面提示词、画师串、ComfyUI 工作流、Vibe 参考图、副 API、自动 tag、排除名单、清洗标签、自定义提示词、界面设置、全局角色库、每日出图计数。
      不会带上：每个聊天自己的角色档案（跟着聊天走）、已经出的图、画师串预览图、悬浮球自定义图标。
    </p>

    <label class="bbi-switch-row">
      <span class="bbi-field-label">包含 API Key</span>
      <input v-model="withKeys" class="bbi-checkbox" type="checkbox" :disabled="busy" />
    </label>
    <p class="bbi-field-hint">
      勾上的话，导入后不用重新填 Key。文件里有 Key，别发给别人；要发给别人看配置就取消勾选。
    </p>

    <div class="bbi-backup-actions">
      <button class="bbi-btn bbi-btn-primary" type="button" :disabled="busy" @click="exportSettings">导出设置</button>
      <button class="bbi-btn" type="button" :disabled="busy" @click="pickFile">导入设置</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
    </div>
  </Collapsible>
</template>

<style scoped>
.bbi-backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
