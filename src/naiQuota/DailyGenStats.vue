<script setup lang="ts">
import { computed, ref } from 'vue';

import BbiSelect from '@/components/BbiSelect.vue';

import { modelLabel, modelsIn, recentDays, statFor, type DayStat, type ModelStat } from './daily';

/**
 * 「每天出了几张」(本 fork 独有):可选只看某个模型;今天一行写明细,
 * 下面列最近几天,张数配一根小条好比较。
 */

const expanded = ref(false);
/** 空串 = 所有模型 */
const model = ref('');
const days = computed(() => recentDays(expanded.value ? 30 : 7));
const models = computed(() => modelsIn(recentDays(30)));
const options = computed(() => [{ value: '', label: '全部模型' }, ...models.value.map(key => ({ value: key, label: modelLabel(key) }))]);
const rows = computed(() => days.value.map(d => ({ date: d.date, stat: statFor(d, model.value), day: d })));
const today = computed(() => rows.value[0]);
const max = computed(() => Math.max(1, ...rows.value.map(r => r.stat.total)));
const sum = computed(() => rows.value.reduce((n, r) => n + r.stat.total, 0));

function label(date: string, i: number): string {
  if (i === 0) return '今天';
  if (i === 1) return '昨天';
  return date.slice(5).replace('-', '/');
}

function freePaid(s: ModelStat): string[] {
  const parts: string[] = [];
  if (s.free) parts.push(`免费 ${s.free}`);
  if (s.paid) parts.push(`扣 Anlas ${s.paid}（约 ${s.anlas.toLocaleString()}）`);
  return parts;
}

/** 选了模型:免费 / 扣 Anlas;全部:各模型几张,再加免费 / 扣 Anlas。 */
function detail(day: DayStat, stat: ModelStat): string {
  if (model.value) return freePaid(stat).join('、');
  const per = modelsIn([day]).map(key => `${modelLabel(key)} ${day.models[key].total}`);
  const fp = freePaid(day);
  return [per.join('、'), fp.length ? `其中${fp.join('、')}` : ''].filter(Boolean).join('；');
}
</script>

<template>
  <div class="nq-daily">
    <div class="nq-daily-head">
      <span class="bbi-field-label">每日出图</span>
      <BbiSelect v-if="models.length > 1" v-model="model" class="nq-daily-model" :options="options" aria-label="看哪个模型" />
    </div>
    <p class="nq-daily-today">
      今天 <b>{{ today.stat.total }}</b> 张<template v-if="today.stat.total && detail(today.day, today.stat)">：{{ detail(today.day, today.stat) }}</template>
    </p>
    <ul class="nq-daily-list">
      <li v-for="(r, i) in rows" :key="r.date" :title="detail(r.day, r.stat)">
        <span class="nq-daily-date">{{ label(r.date, i) }}</span>
        <span class="nq-daily-bar"><span :style="{ width: `${(r.stat.total / max) * 100}%` }"></span></span>
        <span class="nq-daily-num">{{ r.stat.total }}</span>
      </li>
    </ul>
    <p class="bbi-field-hint">
      {{ model ? modelLabel(model) + ' ' : '' }}最近 {{ days.length }} 天共 {{ sum }} 张。
      <button class="nq-link" type="button" @click="expanded = !expanded">{{ expanded ? '只看 7 天' : '看 30 天' }}</button>
    </p>
    <p class="bbi-field-hint">
      每出成一张记一笔，所有后端都算，按模型分开（ComfyUI 按预设名）。NAI 官方的按出图时查到的订阅分免费 / 扣 Anlas，扣的数是估算。
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
  align-items: center;
  gap: 6px 10px;
}

.nq-daily-model {
  flex: 1;
  min-width: 140px;
}

.nq-daily-today {
  margin: 6px 0 0;
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
