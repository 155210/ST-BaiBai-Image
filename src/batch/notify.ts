/**
 * 批量跑完的提醒:手机上人常常不盯着屏幕,只靠 toast 容易错过。
 * 震动 + 两声短提示音 + 系统通知(只在用户以前允许过通知时才发,这里不主动申请)。
 * 页面在后台时,在标签页标题前打个 ✅,回到页面自动去掉。每一样失败都静默跳过。
 */
export function notifyDone(title: string, body: string): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* 不支持震动 */
  }
  beep();
  void systemNotify(`柏宝绘：${title}`, body);
  markTitle(title);
}

function beep(): void {
  try {
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audio = new AudioCtx();
    for (const at of [0, 0.25]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + at);
      osc.stop(audio.currentTime + at + 0.15);
    }
    setTimeout(() => void audio.close?.(), 1000);
  } catch {
    /* 浏览器不让放声音 */
  }
}

/** 安卓 Chrome 不支持页面里直接 new Notification,要走 Service Worker。 */
async function systemNotify(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) {
      await registration.showNotification(title, { body });
      return;
    }
  } catch {
    /* 走下面的直接通知 */
  }
  try {
    new Notification(title, { body });
  } catch {
    /* 没办法了 */
  }
}

function markTitle(title: string): void {
  if (!document.hidden) return;
  const old = document.title;
  document.title = `✅ ${title} - ${old}`;
  const restore = () => {
    if (document.hidden) return;
    document.title = old;
    document.removeEventListener('visibilitychange', restore);
  };
  document.addEventListener('visibilitychange', restore);
}
