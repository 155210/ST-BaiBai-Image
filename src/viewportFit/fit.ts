import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * 全屏遮罩贴合真正看得见的屏幕(本 fork 新增)。
 *
 * ST 给 html 加了 transform,部分安卓浏览器里 position:fixed 的遮罩因此不是相对屏幕摆,
 * 而是跟着 html 的盒子走:地址栏收起/展开后,遮罩往上偏、底下露出一截黑屏,顶上的按钮被状态栏挡住。
 * 这里按 visualViewport 量出屏幕实际的位置和高度,把遮罩的 top/height 直接写成内联样式校正过去;
 * 量出来本来就对齐时什么都不改。
 */

interface Viewport {
  top: number;
  height: number;
}

function viewport(): Viewport {
  const vv = window.visualViewport;
  return vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight };
}

/** 现在的内联 top 与量到的位置 → 要写的 top;差不到 1px 返回 null(不动)。 */
export function correctedTop(currentTop: number, rectTop: number, viewTop: number): number | null {
  const diff = viewTop - rectTop;
  return Math.abs(diff) < 1 ? null : currentTop + diff;
}

export function fitToViewport(el: HTMLElement): void {
  const { top, height } = viewport();
  if (!(height > 0)) return;
  if (Math.abs(el.getBoundingClientRect().height - height) >= 1) {
    el.style.bottom = 'auto';
    el.style.height = `${height}px`;
  }
  const current = parseFloat(el.style.top) || 0;
  const next = correctedTop(current, el.getBoundingClientRect().top, top);
  if (next !== null) el.style.top = `${next}px`;
}

/** 挂载后贴合一次,之后窗口/可视区变化(转屏、地址栏伸缩、键盘)再贴。 */
export function useViewportFit(target: Ref<HTMLElement | null | undefined>): void {
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (target.value) fitToViewport(target.value);
    });
  };
  const vv = window.visualViewport;
  onMounted(() => {
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
  });
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
  });
}
