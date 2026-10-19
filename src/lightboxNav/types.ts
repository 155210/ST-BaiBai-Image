/** 灯箱左右切换(本 fork 新增):给了哪个方向就显示哪个箭头。 */
export interface LightboxNav {
  prev?: () => void;
  next?: () => void;
  /** 例如「3 / 12」,不给就不显示。 */
  label?: string;
  /** 给了就在左上角显示「重新生成」。 */
  regenerate?: () => void;
  /** 给了就在「重新生成」旁边显示「编辑」(改这张卡片的提示词)。 */
  edit?: () => void;
  /** 同一张卡片的历史 roll(小箭头,和切卡片的大箭头分开)。 */
  rolls?: { index: number; total: number; prev?: () => void; next?: () => void };
  /** 「⋯」里收起来的操作(比如删除),点开才看得到,防误触。 */
  menu?: { label: string; danger?: boolean; action: () => void }[];
  /**
   * 灯箱开着时每 800ms 调一次,返回这张卡片的生成状态(生成中 / 排队中 / 失败);
   * 返回 null 表示没在生成。生成中时「重新生成」和「⋯」先收起来。
   */
  poll?: () => LightboxStatus | null;
}

export interface LightboxStatus {
  text: string;
  error?: boolean;
  cancel?: () => void;
}
