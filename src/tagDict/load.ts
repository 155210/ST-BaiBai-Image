import { shallowRef } from 'vue';

import { createTagDict, type TagDict, type TagDictData } from '@/tagDict/dict';
import { versionedAssetUrl } from '@/version';

/**
 * 读标签库数据(dict/tags.json,2MB 左右)。第一次用到才读,读过就留在内存里;
 * 读不到(比如扩展目录被改名、文件缺失)时各处功能直接跳过,不影响写 tag 和出图。
 */

/** 读好的标签库;没读好时是 null(界面据此显示「加载中」) */
export const tagDict = shallowRef<TagDict | null>(null);

let loading: Promise<TagDict | null> | null = null;

export function loadTagDict(): Promise<TagDict | null> {
  if (tagDict.value) return Promise.resolve(tagDict.value);
  if (!loading) {
    // dist/index.js 的上一级就是扩展目录
    const url = versionedAssetUrl('../dict/tags.json', import.meta.url);
    loading = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`标签库数据读不到(${response.status})`);
        return response.json() as Promise<TagDictData>;
      })
      .then(data => {
        tagDict.value = createTagDict(data);
        return tagDict.value;
      })
      .catch(error => {
        console.warn('[柏宝绘] 标签库读取失败', error);
        loading = null;
        return null;
      });
  }
  return loading;
}
