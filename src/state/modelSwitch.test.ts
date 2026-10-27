import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/st/context', () => ({ getContext: () => null }));

import { currentModel, modelOptions, setModel } from '@/state/modelSwitch';
import { newComfyWorkflow, settings } from '@/state/settings';

function readyWorkflow(name: string) {
  const w = newComfyWorkflow(name);
  w.mode = 'custom';
  w.workflow = '{"1":{}}';
  return w;
}

describe('图片浏览的出图模型切换', () => {
  beforeEach(() => {
    const a = readyWorkflow('SDXL 动漫');
    const b = readyWorkflow('写实');
    const empty = newComfyWorkflow('空的');
    empty.mode = 'custom';
    empty.workflow = '';
    settings.comfyui.workflows = [a, b, empty];
    settings.comfyui.activeWorkflowId = a.id;
    settings.nai.endpoints.forEach(e => (e.key = ''));
    settings.nai.model = 'nai-diffusion-4-5-full';
    settings.defaultBackend = 'comfyui';
  });

  it('只列能出图的:没填 NAI key 不列 NAI,没配好的工作流不列', () => {
    expect(modelOptions().map(o => o.label)).toEqual(['ComfyUI · SDXL 动漫', 'ComfyUI · 写实']);
    settings.nai.endpoints[0].key = 'k';
    expect(modelOptions().filter(o => o.value.startsWith('nai:'))).toHaveLength(4);
  });

  it('和渠道页同一份设置:这里切了那边跟着变,那边切了这里跟着变', () => {
    const [a, b] = settings.comfyui.workflows;
    expect(currentModel()).toBe(`comfy:${a.id}`);
    setModel(`comfy:${b.id}`);
    expect(settings.comfyui.activeWorkflowId).toBe(b.id);

    setModel('nai:nai-diffusion-5-full');
    expect(settings.defaultBackend).toBe('nai');
    expect(settings.nai.model).toBe('nai-diffusion-5-full');
    expect(currentModel()).toBe('nai:nai-diffusion-5-full');

    settings.nai.model = 'nai-diffusion-4-5-curated';
    expect(currentModel()).toBe('nai:nai-diffusion-4-5-curated');
    expect(modelOptions().some(o => o.value === currentModel())).toBe(true);
  });

  it('不认识的值不动设置', () => {
    setModel('nai:nai-diffusion-3');
    setModel('comfy:nope');
    expect(settings.defaultBackend).toBe('comfyui');
    expect(settings.nai.model).toBe('nai-diffusion-4-5-full');
  });
});
