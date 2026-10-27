/** 标签库的三个开关,存在 settings.autoTag.tagDict(随设置导出 / 导入)。 */
export interface TagDictSettings {
  /** 写 tag 前:从正文里找出标签库认识的中文词,把「中文=英文」附给 AI */
  hint: boolean;
  /** AI 写完后:对照标签库纠正写法、去掉重复 */
  fix: boolean;
  /** 编辑提示词时:输入中文或英文开头,下面给出标签候选 */
  suggest: boolean;
}

export function tagDictDefaults(): TagDictSettings {
  return { hint: true, fix: true, suggest: true };
}

export function normalizeTagDict(raw: unknown): TagDictSettings {
  const d = tagDictDefaults();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TagDictSettings>;
  return {
    hint: typeof r.hint === 'boolean' ? r.hint : d.hint,
    fix: typeof r.fix === 'boolean' ? r.fix : d.fix,
    suggest: typeof r.suggest === 'boolean' ? r.suggest : d.suggest,
  };
}
