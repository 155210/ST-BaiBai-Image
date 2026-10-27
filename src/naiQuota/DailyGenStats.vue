<script setup lang="ts">
import { computed, ref } from 'vue';

import { recentDays, type DayStat } from './daily';

/** 「每天出了几张」(本 fork 独有):今天一行写明细,下面列最近几天,张数配一根小条好比较。 */

const expanded = ref(false);
const days = computed(() => recentDays(expanded.value ? 30 : 7));
const today = computed(() => days.value[0]);
const max = computed(() => Math.max(1, ...days.value.map(d => d.total)));
const sum = computed(() => days.value.reduce((n, d) => n + d.total, 0));

function label(date: string, i: number): string {
  if (i === 0) return '今天';
  if (i === 1) return '昨天';
  return date.slice(5).replace('-', '/');
}

function detail(d: DayStat): string {
  const parts: string[] = [];
  if (d.free) parts.push(`免费 ${d.free}`);
  if (d.paid) parts.push(`扣 Anlas ${d.paid}（约 ${d.anlas.toLocaleString()}）`);
  const other = d.nai - d.free - d.paid;
  if (other > 0) parts.push(`NAI 其他 ${other}`);
  if (d.comfy) parts.push(`ComfyUI ${d.comfy}`);
  return parts.join('、');
}
</script>

<template>
  <div class="nq-daily">
    <div class="nq-daily-head">
      <span class="bbi-field-label">每日出图</span>
      <span class="nq-daily-today">
        今天 <b>{{ today.total }}</b> 张<template v-if="today.total && detail(today)">：{{ detail(today) }}</template>
      </span>
    </div>
    <ul class="nq-daily-list">
      <li v-for="(d, i) in days" :key="d.date" :title="detail(d)">
        <span class="nq-daily-date">{{ label(d.date, i) }}</span>
        <span class="nq-daily-bar"><span :style="{ width: `${(d.total / max) * 100}%` }"></span></span>
        <span class="nq-daily-num">{{ d.total }}</span>
      </li>
    </ul>
    <p class="bbi-field-hint">
      最近 {{ days.length }} 天共 {{ sum }} 张。
      <button class="nq-link" type="button" @click="expanded = !expanded">{{ expanded ? '只看 7 天' : '看 30 天' }}</button>
    </p>
    <p class="bbi-field-hint">
      每出成一张记一笔，所有后端都算。NAI 官方的按出图时查到的订阅分免费 / 扣 Anlas，扣的数是估算。
      只记这台设备、存在浏览器里，换设备或清浏览器数据会从头记。
    </p>
  </div>
</template>

<style scoped>
.nq-daily {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--bbi-line);
}

.nq-daily-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.nq-daily-today {
  font-size: 13px;
}

.nq-daily-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
}

.nq-daily-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 20px;
}

.nq-daily-date {
  flex: 0 0 3.2em;
  opacity: 0.8;
}

.nq-daily-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--bbi-line);
  overflow: hidden;
}

.nq-daily-bar span {
  display: block;
  height: 100%;
  background: var(--bbi-accent, #d9a441);
}

.nq-daily-num {
  flex: 0 0 2.5em;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.nq-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--bbi-accent, #d9a441);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
