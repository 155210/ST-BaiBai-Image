import { reactive, watch } from 'vue';

/**
 * (本 fork 新增)后台保活:有请求在跑(写 tag、出图)时放一段听不见的低频声音。
 *
 * 手机上页面切到后台后,浏览器会把定时器和网络请求放慢甚至暂停,有的系统还会把整个应用冻住:
 * ComfyUI 查进度的轮询停了、NAI 的请求收不回来,回到前台才接着走。正在出声的页面不会被这样对待,
 * 所以出图期间放一段 30Hz、音量约千分之二的正弦波。用 Web Audio 而不是 <audio>:不抢音频焦点,
 * 不打断正在放的音乐。「加强」改成循环播放一段极小声的音频文件,有的系统只认这种,但可能会暂停音乐。
 *
 * 另外占一把 Web Lock、开一个空的 WebRTC 连接,这两样也是浏览器认的「页面有事在忙」。
 * 最后一个请求结束 90 秒后才关,批量出图两张之间的空档不会关了又开。
 *
 * 开关存在浏览器本地(每台设备各自决定),不进插件设置。
 */

const PREFS_KEY = 'bbi_keep_alive';
const IDLE_OFF_MS = 90_000;

export interface KeepAlivePrefs {
  /** 有请求在跑时保活 */
  on: boolean;
  /** 加强:循环播放极小声的音频文件 */
  strong: boolean;
}

function readPrefs(): KeepAlivePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<KeepAlivePrefs>;
    return { on: saved.on !== false, strong: saved.strong === true };
  } catch {
    return { on: true, strong: false };
  }
}

export const keepAlivePrefs = reactive<KeepAlivePrefs>(readPrefs());
watch(
  keepAlivePrefs,
  value => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    } catch {
      /* 记不住就算了 */
    }
    if (!value.on || !value.strong) stopMedia();
    if (!value.on) shut();
    else if (users > 0) start();
  },
  { deep: true },
);

/** 给设置页看的状态 */
export const keepAliveState = reactive({ running: false, users: 0, pausedSec: 0 });

let ctx: AudioContext | null = null;
let media: HTMLAudioElement | null = null;
let users = 0;
let offTimer: ReturnType<typeof setTimeout> | undefined;
let beat: ReturnType<typeof setInterval> | undefined;
let lastBeat = 0;
let lockRelease: (() => void) | null = null;
let peer: RTCPeerConnection | null = null;

function holdExtras(): void {
  try {
    if (!lockRelease && typeof navigator !== 'undefined' && navigator.locks?.request) {
      // 锁过一会儿才拿到:拿到时要是已经不需要了,马上放掉
      let wanted = true;
      lockRelease = () => {
        wanted = false;
      };
      navigator.locks
        .request('bbi-keepalive', () =>
          wanted
            ? new Promise<void>(resolve => {
                lockRelease = resolve;
              })
            : undefined,
        )
        .catch(() => {});
    }
  } catch {
    /* 不支持就算了 */
  }
  try {
    const PC = typeof window !== 'undefined' ? window.RTCPeerConnection : undefined;
    if (!peer && PC) {
      peer = new PC();
      peer.createDataChannel?.('keepalive');
    }
  } catch {
    peer = null;
  }
}

function dropExtras(): void {
  lockRelease?.();
  lockRelease = null;
  try {
    peer?.close();
  } catch {
    /* 忽略 */
  }
  peer = null;
}

function openAudio(): void {
  if (ctx) return;
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 30;
    gain.gain.value = 0.002;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
  } catch {
    ctx = null;
  }
}

/** 2 秒、8kHz、16 位的 30Hz 极小声正弦波 */
export function quietWav(): Blob {
  const n = 16000;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(60 * Math.sin((2 * Math.PI * 30 * i) / 8000)), true);
  return new Blob([buf], { type: 'audio/wav' });
}

function playMedia(): void {
  if (!keepAlivePrefs.on || !keepAlivePrefs.strong) return;
  try {
    if (!media) {
      media = new Audio(URL.createObjectURL(quietWav()));
      media.loop = true;
    }
    if (media.paused) void Promise.resolve(media.play()).catch(() => {});
  } catch {
    media = null;
  }
}

function stopMedia(): void {
  try {
    media?.pause();
  } catch {
    /* 忽略 */
  }
}

function resume(): void {
  if (ctx?.state === 'suspended') void Promise.resolve(ctx.resume()).catch(() => {});
}

function running(): boolean {
  return (!!ctx && ctx.state === 'running') || (!!media && !media.paused);
}

/** 没有页面的环境(单测)什么都不做 */
const hasPage = typeof window !== 'undefined' && typeof document !== 'undefined';

function start(): void {
  if (!hasPage) return;
  holdExtras();
  openAudio();
  resume();
  playMedia();
  if (!beat) {
    lastBeat = Date.now();
    beat = setInterval(tick, 1000);
  }
}

function shut(): void {
  clearInterval(beat);
  beat = undefined;
  dropExtras();
  stopMedia();
  if (ctx) {
    const c = ctx;
    ctx = null;
    void Promise.resolve(c.close()).catch(() => {});
  }
  keepAliveState.running = false;
}

function tick(): void {
  const now = Date.now();
  const gap = now - lastBeat;
  lastBeat = now;
  // 正常每秒一次;隔了很久才轮到,说明这段时间页面被停住了
  if (gap > 20_000) {
    keepAliveState.pausedSec = Math.round(gap / 1000);
    console.warn(`[柏宝绘] 页面被暂停了约 ${keepAliveState.pausedSec} 秒${running() ? '' : '，后台保活没在运行'}`);
  }
  keepAliveState.running = running();
}

function idleLater(): void {
  clearTimeout(offTimer);
  offTimer = setTimeout(() => {
    if (users === 0) shut();
  }, IDLE_OFF_MS);
}

/**
 * 开始一个需要保活的请求。返回结束函数(幂等),必须在 finally 里调用。
 * 关着开关时什么都不做。
 */
export function keepAwake(): () => void {
  if (!keepAlivePrefs.on) return () => {};
  users++;
  keepAliveState.users = users;
  clearTimeout(offTimer);
  start();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    users = Math.max(0, users - 1);
    keepAliveState.users = users;
    if (users === 0) idleLater();
  };
}

/** 包一层:fn 跑的期间保活 */
export async function withKeepAwake<T>(fn: () => Promise<T>): Promise<T> {
  const done = keepAwake();
  try {
    return await fn();
  } finally {
    done();
  }
}

if (typeof document !== 'undefined') {
  // 浏览器只在点按的那一下允许开始出声:请求跑着时每次点按都把声音补上(比如自动出图时页面还没被点过)
  document.addEventListener(
    'pointerdown',
    () => {
      if (keepAlivePrefs.on && users > 0) start();
    },
    true,
  );
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && users > 0) resume();
  });
}
