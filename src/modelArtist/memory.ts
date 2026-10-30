import { watch } from 'vue';
import { BUILTIN_NAI_ARTISTS } from '@/backends/nai';
import { getContext } from '@/st/context';
import { NAI_MODELS, settings } from '@/state/settings';

/**
 * fork:切 NAI 模型时画师串跟着切。每个模型记住上次在它下面选的画师串
 * (连同画师串里绑定的正/负面词一起),切回来就自动换上。
 *
 * 记录存在 extensionSettings[KEY]:{ 模型标识: 画师串 id },跟着酒馆设置走,
 * 不动 settings.nai 的结构,旧数据不受影响。某个模型还没记过时,不改当前画师串,
 * 只把当前这条记到新模型名下。记的画师串被删了就跳过。
 */

const KEY = 'bbi_model_artists';

export type ModelArtistMap = Record<string, string>;

interface Snapshot {
  model: string;
  artistId: string;
}

/**
 * 纯判断:模型变了、画师串没变 → 按记录换(返回要换成的 id);
 * 其余情况(只改画师串、导入设置时两者一起变)返回 null,由调用方记下当前组合。
 */
export function artistToRestore(
  prev: Snapshot,
  next: Snapshot,
  map: ModelArtistMap,
  exists: (id: string) => boolean,
): string | null {
  if (prev.model === next.model || prev.artistId !== next.artistId) return null;
  if (!Object.prototype.hasOwnProperty.call(map, next.model)) return null;
  const id = map[next.model];
  if (typeof id !== 'string' || id === next.artistId) return null;
  if (id && !exists(id)) return null;
  return id;
}

function store(): { map: ModelArtistMap; save: () => void } | null {
  const ctx = getContext();
  const all = ctx?.extensionSettings as Record<string, unknown> | undefined;
  if (!all) return null;
  const raw = all[KEY];
  const map: ModelArtistMap =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as ModelArtistMap) : {};
  all[KEY] = map;
  return { map, save: () => ctx?.saveSettingsDebounced?.() };
}

function artistExists(id: string): boolean {
  return settings.nai.artistPresets.some(a => a.id === id) || BUILTIN_NAI_ARTISTS.some(a => a.id === id);
}

function artistName(id: string): string {
  if (!id) return '不使用画师串';
  const a = settings.nai.artistPresets.find(p => p.id === id) ?? BUILTIN_NAI_ARTISTS.find(p => p.id === id);
  return a ? `「${a.name || '未命名'}」` : '';
}

function modelName(model: string): string {
  return (NAI_MODELS.find(m => m.value === model)?.label ?? model).replace(/[(（].*$/, '').trim();
}

export function bindModelArtistMemory(): void {
  const s = store();
  if (!s) return;
  if (!(settings.nai.model in s.map)) {
    s.map[settings.nai.model] = settings.nai.activeArtistId;
    s.save();
  }
  watch(
    () => ({ model: settings.nai.model as string, artistId: settings.nai.activeArtistId }),
    (next, prev) => {
      const cur = store();
      if (!cur) return;
      const restore = artistToRestore(prev, next, cur.map, artistExists);
      if (restore !== null) {
        settings.nai.activeArtistId = restore;
        toastr.info(`${modelName(next.model)} 换回上次用的画师串：${artistName(restore)}`, '柏宝绘');
        return; // 改 activeArtistId 会再触发一次,那次走下面记录
      }
      if (cur.map[next.model] !== next.artistId) {
        cur.map[next.model] = next.artistId;
        cur.save();
      }
    },
  );
}
