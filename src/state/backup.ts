import { loadVibeData, saveVibeFiles } from '@/backends/vibeStore';
import { exportDailyStats, importDailyStats } from '@/naiQuota/daily';
import { globalCharTagLib, replaceGlobalCharTags } from '@/state/globalCharTags';
import { replaceSettings, settings, type NaiVibeData } from '@/state/settings';
import { PLUGIN_VERSION } from '@/version';

/**
 * 导出 / 导入设置(换手机、换酒馆时用)。
 *
 * 设置本来就存在酒馆服务器的 settings.json 里,同一个酒馆换设备打开会自动同步;
 * 这里管的是「换了一个酒馆」(比如新手机上重装)。
 *
 * 文件里有:插件全部设置(出图渠道与接入点、正负面提示词、画师串、ComfyUI 工作流、
 * 副 API 渠道、自动 tag、排除名单、清洗标签、自定义提示词、界面设置)、全局角色库、
 * Vibe 参考图本身(它们在服务器上是单独的文件,不带上的话换了酒馆就只剩一个名字)、
 * 每日出图计数(存在浏览器里的,导入时和本机已有的合并)。
 * 不包括:每个聊天自己的角色档案(跟着聊天文件走)、楼层里的图(在聊天和图库里)、
 * 画师串的预览图和悬浮球自定义图标(服务器上的图片文件)、批量页的范围等本机小设置。
 */

export const BACKUP_FORMAT = 'st-baibai-image-settings';
const BACKUP_VERSION = 1;

export interface SettingsBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  pluginVersion: string;
  exportedAt: string;
  /** 是否带了 API Key。 */
  withKeys: boolean;
  settings: unknown;
  globalCharacters: unknown[];
  /** vibe id → 正文。 */
  vibes: Record<string, NaiVibeData>;
  /** 每日出图计数(naiQuota/daily.ts);旧文件没有 */
  dailyGenStats?: unknown;
}

interface Keyed {
  key?: string;
}

/** 把设置里所有 API Key 清空(给别人看配置时用)。 */
export function stripKeys(raw: Record<string, unknown>): void {
  const nai = raw.nai as { key?: string; endpoints?: Keyed[] } | undefined;
  if (nai) {
    nai.key = '';
    for (const endpoint of nai.endpoints ?? []) endpoint.key = '';
  }
  for (const channel of (raw.channels as Keyed[] | undefined) ?? []) channel.key = '';
}

export async function buildBackup(withKeys: boolean): Promise<{ backup: SettingsBackup; missingVibes: string[] }> {
  const copy = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
  if (!withKeys) stripKeys(copy);
  const vibes: Record<string, NaiVibeData> = {};
  const missingVibes: string[] = [];
  for (const vibe of settings.nai.vibes) {
    try {
      vibes[vibe.id] = await loadVibeData(vibe);
    } catch {
      missingVibes.push(vibe.name);
    }
  }
  return {
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      pluginVersion: PLUGIN_VERSION,
      exportedAt: new Date().toISOString(),
      withKeys,
      settings: copy,
      globalCharacters: JSON.parse(JSON.stringify(globalCharTagLib.entries)) as unknown[],
      vibes,
      dailyGenStats: exportDailyStats(),
    },
    missingVibes,
  };
}

/** 读文件内容并检查是不是本插件导出的设置;不是就抛出给人看的错误。 */
export function parseBackup(text: string): SettingsBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('这个文件不是柏宝绘导出的设置（不是 JSON）');
  }
  const backup = data as Partial<SettingsBackup> | null;
  if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.settings !== 'object' || !backup.settings) {
    throw new Error('这个文件不是柏宝绘导出的设置');
  }
  if (typeof backup.version === 'number' && backup.version > BACKUP_VERSION) {
    throw new Error('这个文件是更新版本的柏宝绘导出的，请先更新插件');
  }
  return {
    format: BACKUP_FORMAT,
    version: backup.version ?? 1,
    pluginVersion: String(backup.pluginVersion ?? ''),
    exportedAt: String(backup.exportedAt ?? ''),
    withKeys: backup.withKeys !== false,
    settings: backup.settings,
    globalCharacters: Array.isArray(backup.globalCharacters) ? backup.globalCharacters : [],
    vibes: backup.vibes && typeof backup.vibes === 'object' ? backup.vibes : {},
    dailyGenStats: backup.dailyGenStats,
  };
}

export interface ImportReport {
  characters: number;
  vibes: number;
  failedVibes: string[];
  /** 文件里带了几天的出图计数 */
  statDays: number;
}

/**
 * 应用一份导出的设置:先把 Vibe 正文写回服务器(换了酒馆时文件路径已失效),
 * 再整体替换设置与全局角色库。没带 Key 的文件保留本机现有的 Key,免得导入后出不了图。
 */
export async function applyBackup(backup: SettingsBackup): Promise<ImportReport> {
  const next = JSON.parse(JSON.stringify(backup.settings)) as Record<string, unknown>;
  if (!backup.withKeys) keepCurrentKeys(next);

  const nai = next.nai as { vibes?: Array<{ id?: string; name?: string; dataPath?: string; thumbnailPath?: string }> };
  const failedVibes: string[] = [];
  let restored = 0;
  for (const vibe of nai?.vibes ?? []) {
    const data = vibe.id ? backup.vibes[vibe.id] : undefined;
    if (!data?.encodings) continue;
    try {
      const paths = await saveVibeFiles(data, null, vibe.id);
      vibe.dataPath = paths.dataPath;
      vibe.thumbnailPath = paths.thumbnailPath;
      restored++;
    } catch {
      failedVibes.push(vibe.name || vibe.id || '?');
    }
  }

  replaceSettings(next);
  const characters = replaceGlobalCharTags(backup.globalCharacters);
  const statDays = backup.dailyGenStats ? importDailyStats(backup.dailyGenStats) : 0;
  return { characters, vibes: restored, failedVibes, statDays };
}

/** 文件里的 Key 是空的:按 id 用本机现有的那份补上。 */
function keepCurrentKeys(next: Record<string, unknown>): void {
  const nai = next.nai as { key?: string; endpoints?: Array<{ id?: string; key?: string }> } | undefined;
  if (nai) {
    if (!nai.key) nai.key = settings.nai.key;
    for (const endpoint of nai.endpoints ?? []) {
      if (!endpoint.key) endpoint.key = settings.nai.endpoints.find(item => item.id === endpoint.id)?.key ?? '';
    }
  }
  for (const channel of (next.channels as Array<{ id?: string; key?: string }> | undefined) ?? []) {
    if (!channel.key) channel.key = settings.channels.find(item => item.id === channel.id)?.key ?? '';
  }
}

/** 下载成文件。手机浏览器会存进「下载」。 */
export function downloadBackup(backup: SettingsBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = backup.exportedAt.slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `baibai-image-settings_${stamp}.json`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
