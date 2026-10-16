<script setup>
import { useUiStore } from '../stores/ui'
import AppIcon from './AppIcon.vue'

const ui = useUiStore()

const ICON = { success: 'check', error: 'info', warn: 'info', info: 'info' }
</script>

<template>
  <Teleport to="body">
    <div class="toast-host">
      <TransitionGroup name="toast">
        <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="`toast--${t.type}`">
          <AppIcon :name="ICON[t.type] || 'info'" :size="16" />
          <span>{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 90;
  bottom: calc(28px + var(--safe-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(520px, 88vw);
  padding: 10px 16px;
  font-size: 13.5px;
  line-height: 1.5;
  border-radius: 11px;
  background: color-mix(in srgb, var(--fg) 88%, var(--bg));
  color: var(--bg);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(10px);
}

.toast--success {
  background: color-mix(in srgb, var(--accent) 92%, #000);
  color: #fff;
}

.toast--error {
  background: #c0483a;
  color: #fff;
}

.toast--warn {
  background: #b58436;
  color: #fff;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.24s var(--ease), transform 0.24s var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

.toast-move {
  transition: transform 0.24s var(--ease);
}
</style>
