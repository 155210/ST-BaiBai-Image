import { validateSimpleConfig } from '@/backends/comfyTemplates';
import { activeComfyPreset, NAI_MODELS, settings, type ComfyWorkflowPreset } from '@/state/settings';

/**
 * fork:出图模型快捷切换(批量页「图片浏览」用)。读写的就是「渠道」页那几个字段
 * (settings.defaultBackend、settings.nai.model、settings.comfyui.activeWorkflowId),
 * settings 是 reactive,两边任一处改了另一处自动跟着变,不另存一份。
 *
 * 选项值:`nai:<模型标识>` / `comfy:<工作流 id>`。选 NAI 的模型会顺带把出图后端切到 NAI,
 * 选 ComfyUI 的工作流同理。
 *
 * 只列「能出图」的:NAI 要有接入点填了 key,ComfyUI 的工作流要配齐;
 * 当前正在用的那项不管配没配齐都列,免得下拉显示空白。
 */

export interface ModelOption {
  value: string;
  label: string;
}

function comfyReady(preset: ComfyWorkflowPreset): boolean {
  return preset.mode === 'simple' ? !validateSimpleConfig(preset.simple) : !!preset.workflow.trim();
}

function naiLabel(label: string): string {
  return `NAI · ${label.replace(/^NAI\s*/, '')}`;
}

export function modelOptions(): ModelOption[] {
  const out: ModelOption[] = [];
  const naiOn = settings.defaultBackend === 'nai';
  if (naiOn || settings.nai.endpoints.some(e => e.key.trim())) {
    for (const m of NAI_MODELS) out.push({ value: `nai:${m.value}`, label: naiLabel(m.label) });
  }
  const comfyOn = settings.defaultBackend === 'comfyui';
  const active = activeComfyPreset();
  for (const w of settings.comfyui.workflows) {
    if (comfyReady(w) || (comfyOn && w.id === active.id)) {
      out.push({ value: `comfy:${w.id}`, label: `ComfyUI · ${w.name || '未命名工作流'}` });
    }
  }
  return out;
}

/** 当前生效的那一项(和出图时实际用的一致)。没选后端时为空串。 */
export function currentModel(): string {
  if (settings.defaultBackend === 'nai') return `nai:${settings.nai.model}`;
  if (settings.defaultBackend === 'comfyui') return `comfy:${activeComfyPreset().id}`;
  return '';
}

export function setModel(value: string): void {
  const sep = value.indexOf(':');
  const kind = value.slice(0, sep);
  const id = value.slice(sep + 1);
  if (kind === 'nai') {
    const hit = NAI_MODELS.find(m => m.value === id);
    if (!hit) return;
    settings.nai.model = hit.value;
    settings.defaultBackend = 'nai';
  } else if (kind === 'comfy') {
    if (!settings.comfyui.workflows.some(w => w.id === id)) return;
    settings.comfyui.activeWorkflowId = id;
    settings.defaultBackend = 'comfyui';
  }
}
