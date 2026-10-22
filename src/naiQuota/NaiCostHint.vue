<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { activeNaiEndpoint, effectiveNai, settings } from '@/state/settings';

import { estimateBoth, isOfficialUrl, quotaState, refreshNaiQuota } from './quota';

/** 批量页出图前的一行提示:NAI 官方每张免费还是扣 Anlas、余额多少(本 fork 独有)。 */

const shown = computed(() => settings.defaultBackend === 'nai' && isOfficialUrl(activeNaiEndpoint().url) && !!activeNaiEndpoint().key.trim());
const quota = computed(() => (quotaState.key === activeNaiEndpoint().key.trim() ? quotaState.quota : null));
const text = computed(() => {
  const q = quota.value;
  if (!q) return quotaState.error ? `NAI 官方额度查询失败：${quotaState.error}` : '';
  const parts = estimateBoth(q, {
    portraitSize: settings.nai.portraitSize,
    landscapeSize: settings.nai.landscapeSize,
    steps: settings.nai.steps,
  }).map(e => `${e.label}${e.free ? '免费' : `每张约 ${e.cost} Anlas`}`);
  const anlas = q.anlas === null ? '' : ` · Anlas ${q.anlas.toLocaleString()}`;
  return `NAI 官方 ${q.tierName}${anlas} · ${parts.join('、')}`;
});
const paid = computed(() => {
  const q = quota.value;
  if (!q) return false;
  return estimateBoth(q, settings.nai).some(e => !e.free);
});

onMounted(() => {
  if (shown.value && !quotaState.loading) void refreshNaiQuota(effectiveNai()).catch(() => undefined);
});
</script>

<template>
  <p v-if="shown && text" class="bbi-field-hint nq-cost" :class="{ 'is-paid': paid }">
    {{ text }}
    <template v-if="paid && settings.nai.freeOnly">（已开「只用免费额度」：会扣 Anlas 的图不出，批量会停下）</template>
    <template v-else-if="paid">（会扣 Anlas；不想扣可在 NAI 页开「只用免费额度」）</template>
  </p>
</template>

<style scoped>
.nq-cost.is-paid {
  color: var(--bbi-danger, #d9534f);
}
</style>
