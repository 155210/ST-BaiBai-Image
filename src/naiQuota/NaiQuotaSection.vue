<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';

import Collapsible from '@/components/Collapsible.vue';
import { activeNaiEndpoint, effectiveNai, settings } from '@/state/settings';

import DailyGenStats from './DailyGenStats.vue';
import { batteryEmptyFor, describeBatteryLeft, describeBatteryRefill, describeFreeLimits, estimateBoth, isNaiV5, isOfficialUrl, quotaState, refreshNaiQuota } from './quota';

/**
 * NAI 页「官方额度与 Anlas」(本 fork 独有):订阅档位、Anlas 余额、
 * Opus 免费额度剩多少、每天回多少,按当前尺寸与步数每张免费还是扣多少,
 * 「只用免费额度」开关,以及每天出了几张图。
 */

const official = computed(() => isOfficialUrl(activeNaiEndpoint().url));
const hasKey = computed(() => !!activeNaiEndpoint().key.trim());
const quota = computed(() => (quotaState.key === activeNaiEndpoint().key.trim() ? quotaState.quota : null));
const estimates = computed(() =>
  quota.value
    ? estimateBoth(quota.value, {
        portraitSize: settings.nai.portraitSize,
        landscapeSize: settings.nai.landscapeSize,
        steps: settings.nai.steps,
        model: settings.nai.model,
      })
    : [],
);
const anlasSplit = computed(() => {
  const q = quota.value;
  if (!q || q.anlasFixed === null || q.anlasPurchased === null || q.anlasPurchased <= 0) return '';
  return `订阅送的 ${q.anlasFixed.toLocaleString()} + 买的 ${q.anlasPurchased.toLocaleString()}`;
});
const refill = computed(() => (quota.value?.battery ? describeBatteryRefill(quota.value.battery) : ''));
const batteryOut = computed(() => !!quota.value && batteryEmptyFor(quota.value, settings.nai.model));

function formatDate(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function refresh(): Promise<void> {
  if (!official.value || !hasKey.value || quotaState.loading) return;
  try {
    await refreshNaiQuota(effectiveNai());
  } catch {
    // 原因已记在 quotaState.error,界面上显示
  }
}

onMounted(refresh);
watch(() => [activeNaiEndpoint().id, activeNaiEndpoint().key], refresh);
</script>

<template>
  <Collapsible title="官方额度与 Anlas" :open="true">
    <p v-if="!official" class="bbi-field-hint">
      当前接入点不是 NovelAI 官方，查不到官方订阅和 Anlas；第三方站的额度请在那个站上看。
    </p>
    <p v-else-if="!hasKey" class="bbi-field-hint">在上面「配置」里填好官方 API Key 后，这里会显示订阅和 Anlas。</p>
    <template v-else>
      <div class="nq-row">
        <div class="nq-stats">
          <template v-if="quota">
            <span class="nq-stat">
              订阅：<b>{{ quota.tierName }}</b>
              <template v-if="!quota.active">（未激活）</template>
              <template v-else-if="quota.expiresAt">（到 {{ formatDate(quota.expiresAt) }}）</template>
            </span>
            <span class="nq-stat">
              Anlas 余额：<b>{{ quota.anlas === null ? '查不到' : quota.anlas.toLocaleString() }}</b>
              <template v-if="anlasSplit">（{{ anlasSplit }}）</template>
            </span>
            <span v-if="quota.battery" class="nq-stat" :class="{ 'nq-error': quota.battery.empty }">
              Opus 免费额度：<b>{{ describeBatteryLeft(quota.battery) }}</b>
            </span>
          </template>
          <span v-else-if="quotaState.loading" class="nq-stat">查询中…</span>
          <span v-else class="nq-stat nq-error">查询失败：{{ quotaState.error || '未知原因' }}</span>
        </div>
        <button class="bbi-btn" type="button" :disabled="quotaState.loading" @click="refresh">刷新</button>
      </div>

      <template v-if="quota">
        <div v-if="quota.battery" class="nq-bar" :title="`${Math.round(quota.battery.percent)}%`">
          <div class="nq-bar-fill" :style="{ width: `${quota.battery.percent}%` }"></div>
        </div>
        <p v-if="refill" class="nq-refill">{{ refill }}</p>
        <p class="bbi-field-hint">
          免费出图范围：{{ quota.freeLimits.length ? describeFreeLimits(quota) + '，一次 1 张' : '没有（只有 Opus 订阅有免费出图）' }}
        </p>
        <p v-if="quota.battery" class="bbi-field-hint">
          Opus 出 V5 不扣 Anlas，但会耗这个额度（官方「利用上限」），会随时间自动回复；用完后再出 V5 就照常扣 Anlas。
          张数按官网口径估（1% 约 17 张，1024×1024 以内、28 步以内）。
          <template v-if="!isNaiV5(settings.nai.model)">当前模型不是 V5，不耗这个额度。</template>
        </p>
        <ul class="nq-est">
          <li v-for="e in estimates" :key="e.label" :class="{ 'is-paid': !e.free }">
            {{ e.label }} {{ e.width }}×{{ e.height }}、{{ e.steps }} 步：
            <b>{{ e.free ? '免费' : `每张约 ${e.cost} Anlas` }}</b>
            <template v-if="!e.free && batteryOut">（免费额度用完）</template>
          </li>
        </ul>
      </template>
    </template>

    <label class="bbi-switch-row">
      <span class="bbi-field-label">只用免费额度</span>
      <input v-model="settings.nai.freeOnly" type="checkbox" class="bbi-checkbox" />
    </label>
    <p class="bbi-field-hint">
      开了之后，走官方接入点时会扣 Anlas 的图一律不出（卡片上会写原因），批量出图也会在第一张停下；
      查不到订阅状态时同样不出，免得误扣。第三方接入点不受影响。估算不含 Vibe 编码等额外费用。
    </p>

    <DailyGenStats />
  </Collapsible>
</template>

<style scoped>
.nq-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.nq-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 13px;
}

.nq-error {
  color: var(--bbi-danger, #d9534f);
}

.nq-bar {
  height: 6px;
  margin: 8px 0 2px;
  border-radius: 3px;
  background: var(--bbi-line);
  overflow: hidden;
}

.nq-bar-fill {
  height: 100%;
  background: var(--bbi-accent, #d9a441);
}

.nq-refill {
  margin: 2px 0 0;
  font-size: 13px;
}

.nq-est {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
}

.nq-est .is-paid b {
  color: var(--bbi-danger, #d9534f);
}
</style>
