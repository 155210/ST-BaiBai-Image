<script setup lang="ts">
import { ref, watch } from 'vue';

import { searchNames, searchState, splitNames, stripTagList } from '@/batch/search';
import { charTagLib } from '@/state/charTags';
import { settings } from '@/state/settings';
import { getContext } from '@/st/context';
import SearchHits from './SearchHits.vue';

/**
 * 批量页「角色搜索」:名字在本聊天哪些楼出现过。逻辑在 batch/search.ts。
 * 搜索框与结果存在 searchState(模块里),切走再回来还在;
 * 「额外排除标签」记在浏览器本地,不进插件设置。
 */

const props = defineProps<{ chatTick: number }>();

const STRIP_KEY = 'bbi_batch_search_strip';

function readStrip(): string {
  try {
    return localStorage.getItem(STRIP_KEY) ?? '';
  } catch {
    return '';
  }
}

const extraStrip = ref(readStrip());

watch(extraStrip, value => {
  try {
    localStorage.setItem(STRIP_KEY, value);
  } catch {
    /* 记不住就算了 */
  }
});

// 换了聊天,旧结果的楼号就对不上了:有搜过就按同样的名字重搜一遍
watch(
  () => props.chatTick,
  () => {
    if (!searchState.result) return;
    const chat = getContext()?.chat;
    if (chat) run(searchState.names, true);
    else searchState.result = null;
  },
);

function run(names: string[], quiet = false): void {
  if (!names.length) {
    if (!quiet) toastr.warning('先输入角色名', '柏宝绘');
    return;
  }
  const chat = getContext()?.chat;
  if (!chat) {
    if (!quiet) toastr.warning('先打开一个聊天', '柏宝绘');
    return;
  }
  const stripTags = stripTagList(settings.excludes.customStripTags, splitNames(extraStrip.value));
  searchState.names = [...new Set(names)];
  searchState.result = searchNames(chat, names, { withUser: searchState.withUser, stripTags });
}

function search(): void {
  run(splitNames(searchState.query));
}

function searchLibrary(): void {
  const names = [...new Set(charTagLib.entries.map(entry => entry.name).filter(Boolean))];
  if (!names.length) {
    toastr.info('柏宝绘角色库是空的', '柏宝绘');
    return;
  }
  searchState.query = names.join(', ');
  run(names);
}
</script>

<template>
  <div class="bbi-sections">
    <div class="bbi-field">
      <span class="bbi-field-label">角色名</span>
      <div class="bbi-search-row">
        <input
          v-model="searchState.query"
          class="bbi-input"
          type="search"
          enterkeyhint="search"
          placeholder="多个名字用逗号或空格隔开"
          @keydown.enter="search"
        />
        <button class="bbi-btn bbi-btn-primary" type="button" @click="search">搜索</button>
      </div>
      <p class="bbi-field-hint">搜索总是搜整个聊天，不看楼层范围。</p>
    </div>

    <div class="bbi-search-row">
      <button class="bbi-btn bbi-btn-sm" type="button" @click="searchLibrary">列出柏宝绘角色库全部角色</button>
    </div>

    <label class="bbi-switch-row">
      <span class="bbi-field-label">也搜用户楼</span>
      <input v-model="searchState.withUser" class="bbi-checkbox" type="checkbox" />
    </label>

    <div class="bbi-field">
      <span class="bbi-field-label">额外排除标签</span>
      <input v-model="extraStrip" class="bbi-input" type="text" placeholder="如 status, summary" />
      <p class="bbi-field-hint">
        这些标签里的内容不算出现。已自动排除：think / thinking / reasoning 等思维链、注释、生图 tag，以及柏宝绘设置里的「自定义清洗标签」。
      </p>
    </div>

    <div v-if="searchState.result" class="bbi-search-result">
      <p class="bbi-search-sum">
        搜了 {{ searchState.names.length }} 个名字，找到
        {{ searchState.result.rows.filter(row => row.floors.length).length }} 个
      </p>
      <SearchHits v-for="row in searchState.result.rows" :key="row.name" :title="row.name" :floors="row.floors" />
      <SearchHits
        v-if="searchState.names.length > 1"
        :title="`同时出现：${searchState.names.join(' + ')}`"
        :floors="searchState.result.together"
        none="没有哪一楼同时出现这些名字"
      />
    </div>
  </div>
</template>

<style scoped>
.bbi-search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.bbi-search-row .bbi-input {
  flex: 1 1 160px;
  min-width: 0;
}
.bbi-search-sum {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--bbi-ink);
}
</style>
