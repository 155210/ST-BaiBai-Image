<script setup lang="ts">
import { keepAlivePrefs, keepAliveState } from './keepAlive';

/** (本 fork 新增)设置页「后台保活」。逻辑在 keepAlive.ts。 */
</script>

<template>
  <label class="bbi-switch-row">
    <span class="bbi-field-label">写 tag、出图时保持后台运行</span>
    <input v-model="keepAlivePrefs.on" type="checkbox" class="bbi-checkbox" />
  </label>
  <p class="bbi-field-hint">
    有请求在跑时页面放一段听不见的低频声音，切到别的 App 时页面不容易被浏览器或系统暂停，出图不会停在半路等你切回来。最后一个请求结束 90
    秒后自动关。浏览器要先有一次点按才让出声：自动出图时要是没起来，点一下页面就好。只管酒馆这个页面，管不了 Termux、代理这些别的应用。
  </p>

  <label class="bbi-switch-row">
    <span class="bbi-field-label">后台保活加强</span>
    <input v-model="keepAlivePrefs.strong" type="checkbox" class="bbi-checkbox" :disabled="!keepAlivePrefs.on" />
  </label>
  <p class="bbi-field-hint">上面那项开着、切后台仍然会停时再开：改成循环播放一段极小声的音频，有的系统只认这种。可能会把正在放的音乐暂停。</p>

  <p v-if="keepAlivePrefs.on" class="bbi-field-hint">
    现在：<template v-if="keepAliveState.users">有 {{ keepAliveState.users }} 个请求在跑，保活{{ keepAliveState.running ? '在运行' : '没起来（点一下页面）' }}</template
    ><template v-else>没有请求在跑</template
    ><template v-if="keepAliveState.pausedSec">；上次页面被暂停了约 {{ keepAliveState.pausedSec }} 秒</template>
  </p>
</template>
