<script setup lang="ts">
import { computed, ref } from 'vue';

import BbiSelect from '@/components/BbiSelect.vue';
import { confirmDialog } from '@/components/confirm';

import { clearDailyStats, dailyState, dayKey, KEEP_DAYS, modelLabel, modelsIn, recentDays, statFor, type DayStat, type ModelStat } from './daily';

/**
 * 「每天出了几张」(本 fork 独有):可选只看某个模型、从哪天往前看;那天一行写明细,
 * 下面列往前 7 / 30 天,张数配一根小条好比较。还有二次确认的「清空计数」。
 */

const expanded = ref(false);
/** 空串 = 所有模型 */
const model = ref('');
/** 从哪天往前数;空串 = 今天 */
const endDate = ref('');
const todayKey = computed(() => dayKey(Date.now()));
const minDate = computed(() => recentDays(KEEP_DAYS)[KEEP_DAYS - 1].date);
const isToday = computed(() => !endDate.value || endDate.value >= todayKey.value);
const endMs = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate.value);
  return m && !isToday.value ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : Date.now();
});
const days = computed(() => recentDays(expanded.value ? 30 : 7, endMs.value));
const models = computed(() => modelsIn(Object.values(dailyState.days)));
const options = computed(() => [{ value: '', label: '全部模型' }, ...models.value.map(key => ({ value: key, label: modelLabel(key) }))]);
const rows = computed(() => days.value.map(d => ({ date: d.date, stat: statFor(d, model.value), day: d })));
const first = computed(() => rows.value[0]);
const hasAny = computed(() => Object.keys(dailyState.days).length > 0);
const max = computed(() => Math.max(1, ...rows.value.map(r => r.stat.total)));
const sum = computed(() => rows.value.reduce((n, r) => n + r.stat.total, 0));

function shortDate(date: string): string {
  return date.slice(5).replace('-', '/');
}

function label(date: string): string {
  if (date === todayKey.value) return '今天';
  if (date === recentDays(2)[1].date) return '昨天';
  return shortDate(date);
}

async function clearAll(): Promise<void> {
  const ok = await confirmDialog({
    title: '清空出图计数',
    text: '这台设备上记的每日出图张数会全部删掉（所有模型、所有日子），不能撤销。\n已经出的图不受影响。',
    confirmText: '清空',
    tone: 'danger',
  });
  if (!ok) return;
  clearDailyStats();
  toastr.success('出图计数已清空', '柏宝绘');
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
    <div class="nq-daily-range">
      <span>从</span>
      <input v-model="endDate" class="bbi-input nq-daily-date-input" type="date" :min="minDate" :max="todayKey" aria-label="从哪天往前看" />
      <span>往前看</span>
      <button v-if="!isToday" class="nq-link" type="button" @click="endDate = ''">回到今天</button>
    </div>
    <p class="nq-daily-today">
      {{ label(first.date) }} <b>{{ first.stat.total }}</b> 张<template v-if="first.stat.total && detail(first.day, first.stat)">：{{ detail(first.day, first.stat) }}</template>
    </p>
    <ul class="nq-daily-list">
      <li v-for="r in rows" :key="r.date" :title="detail(r.day, r.stat)">
        <span class="nq-daily-date">{{ label(r.date) }}</span>
        <span class="nq-daily-bar"><span :style="{ width: `${(r.stat.total / max) * 100}%` }"></span></span>
        <span class="nq-daily-num">{{ r.stat.total }}</span>
      </li>
    </ul>
    <p class="bbi-field-hint">
      {{ model ? modelLabel(model) + ' ' : '' }}{{ isToday ? '最近' : `${shortDate(first.date)} 往前` }} {{ days.length }} 天共 {{ sum }} 张。
      <button class="nq-link" type="button" @click="expanded = !expanded">{{ expanded ? '只看 7 天' : '看 30 天' }}</button>
    </p>
    <p class="bbi-field-hint">
      每出成一张记一笔，所有后端都算，按模型分开（ComfyUI 按预设名）。NAI 官方的按出图时查到的订阅分免费 / 扣 Anlas，扣的数是估算。
      存在这台设备的浏览器里，留 {{ KEEP_DAYS }} 天；导出设置时会一起带走，导入时和这台设备上的合并。
    </p>
    <button class="bbi-btn" type="button" :disabled="!hasAny" @click="clearAll">清空出图计数</button>
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

.nq-daily-range {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 13px;
}

.nq-daily-date-input {
  width: auto;
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
