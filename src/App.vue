<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useReaderStore } from './stores/reader'
import { useShelfStore } from './stores/shelf'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'
import { buildSurfaceFilter } from './utils/theme'
import ShelfView from './components/ShelfView.vue'
import ReaderView from './components/ReaderView.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ToastHost from './components/ToastHost.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import AppIcon from './components/AppIcon.vue'

const reader = useReaderStore()
const shelf = useShelfStore()
const settings = useSettingsStore()
const ui = useUiStore()

const dragDepth = ref(0)

/**
 * 主题变量写到 document.documentElement 上而不是 App 根元素上：
 * 抽屉、确认框这些浮层都是 Teleport 到 body 的，写在根元素上它们继承不到变量。
 */
watchEffect(() => {
  const t = settings.theme
  const root = document.documentElement.style
  root.setProperty('--bg', t.bg)
  root.setProperty('--panel', t.panel)
  root.setProperty('--fg', t.fg)
  root.setProperty('--accent', t.accent)
  root.setProperty('--accent-contrast', settings.isDark ? '#101114' : '#ffffff')
  root.setProperty(
    '--surface-filter',
    buildSurfaceFilter({
      eyeCare: settings.eyeCare,
      warmth: settings.warmth,
      brightness: settings.brightness
    })
  )
  // 代码着色没法从 4 个基础色推出来（关键字色和正文色太近就糊了），由主题直接给定一套
  const code = t.code
  root.setProperty('--code-bg', code.bg)
  root.setProperty('--tok-kw', code.kw)
  root.setProperty('--tok-st', code.st)
  root.setProperty('--tok-cm', code.cm)
  root.setProperty('--tok-nu', code.nu)
})

/* ---------------- 全局拖拽导入 ---------------- */

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files')
}

function onDragEnter(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth.value += 1
  ui.dragging = true
}

function onDragOver(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}

function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) ui.dragging = false
}

async function onDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth.value = 0
  ui.dragging = false
  await shelf.importFiles(e.dataTransfer.files)
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
})
</script>

<template>
  <div class="app">
    <Transition name="view" mode="out-in">
      <ReaderView v-if="reader.view === 'reader'" key="reader" />
      <ShelfView v-else key="shelf" />
    </Transition>

    <SettingsPanel />
    <ToastHost />
    <ConfirmHost />

    <Transition name="fade">
      <div v-if="ui.dragging" class="dropzone">
        <div class="dropzone__box">
          <AppIcon name="upload" :size="34" :stroke="1.5" />
          <p class="dropzone__title">松手即可导入</p>
          <p class="dropzone__hint">支持 .txt / .md，自动识别编码</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/*
 * 护眼滤镜挂在整个应用容器上，而不是正文滚动容器上：
 * 容器只有视口那么大，滤镜的输入被滚动区裁剪；挂在滚动容器上则要对整章内容全量栅格化。
 * 抽屉、提示、确认框都 Teleport 到 body，不在这个子树里，所以不会被一起调暗。
 */
.app {
  position: relative;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  filter: var(--surface-filter);
}

.dropzone {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.dropzone__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 54px 68px;
  border-radius: var(--radius-lg);
  border: 2px dashed color-mix(in srgb, var(--accent) 55%, transparent);
  background: var(--panel);
  box-shadow: var(--shadow-lg);
  color: var(--accent);
}

.dropzone__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--fg);
}

.dropzone__hint {
  font-size: 12.5px;
  color: var(--faint);
}

.view-enter-active,
.view-leave-active {
  transition: opacity 0.22s var(--ease);
}

.view-enter-from,
.view-leave-to {
  opacity: 0;
}
</style>
