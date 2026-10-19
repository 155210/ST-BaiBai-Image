/**
 * (本 fork 新增)「实时输出」展开与否,楼层折叠区和批量页/重写弹窗共用一个偏好:
 * 用户点开过一次,下次也是展开的;默认收起。只记在浏览器本地,不进插件设置。
 */

const OPEN_KEY = 'bbi_stream_view_open';

export function readOpenPref(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOpenPref(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* 记不住就算了 */
  }
}
