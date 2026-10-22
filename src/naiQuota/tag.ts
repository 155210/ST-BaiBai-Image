/** 「只用免费额度」拦截错误的固定开头:批量据此直接暂停,不再一楼楼撞(本 fork 独有)。 */
export const FREE_ONLY_TAG = '【只用免费额度】';

export function isFreeOnlyBlock(reason: string | undefined): boolean {
  return String(reason ?? '').includes(FREE_ONLY_TAG);
}
