/** 灯箱左右切换(本 fork 新增):给了哪个方向就显示哪个箭头。 */
export interface LightboxNav {
  prev?: () => void;
  next?: () => void;
  /** 例如「3 / 12」,不给就不显示。 */
  label?: string;
  /** 给了就在左上角显示「重新生成」。 */
  regenerate?: () => void;
}
