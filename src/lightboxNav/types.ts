/** 灯箱左右切换(本 fork 新增):给了哪个方向就显示哪个箭头。 */
export interface LightboxNav {
  prev?: () => void;
  next?: () => void;
  /** 例如「3 / 12」,不给就不显示。 */
  label?: string;
  /** 给了就在左上角显示「重新生成」。 */
  regenerate?: () => void;
  /** 同一张卡片的历史 roll(小箭头,和切卡片的大箭头分开)。 */
  rolls?: { index: number; total: number; prev?: () => void; next?: () => void };
  /** 「⋯」里收起来的操作(比如删除),点开才看得到,防误触。 */
  menu?: { label: string; danger?: boolean; action: () => void }[];
}
