<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useModalGuard } from '../composables/useModalGuard'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  width: { type: Number, default: 400 }
})

const emit = defineEmits(['close'])
const panel = ref(null)

useModalGuard(computed(() => props.open))

function onKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey, true)
    else window.removeEventListener('keydown', onKey, true)
  },
  { immediate: true }
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="drawer-mask" @click.self="emit('close')" />
    </Transition>
    <Transition name="drawer">
      <aside
        v-if="open"
        ref="panel"
        class="drawer"
        :style="{ width: `${width}px` }"
        role="dialog"
        aria-modal="true"
      >
        <header class="drawer__head">
          <div>
            <h2 class="drawer__title">{{ title }}</h2>
            <p v-if="subtitle" class="drawer__subtitle">{{ subtitle }}</p>
          </div>
          <button class="icon-btn" title="关闭 (Esc)" @click="emit('close')">
            <AppIcon name="close" :size="18" />
          </button>
        </header>
        <div class="drawer__body scroll-area">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="drawer__foot">
          <slot name="footer" />
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgb(0 0 0 / 26%);
}

.drawer {
  position: fixed;
  z-index: 61;
  top: 0;
  right: 0;
  bottom: 0;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  color: var(--fg);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
}

.drawer__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: calc(20px + var(--safe-top)) calc(18px + var(--safe-right)) 14px 22px;
  border-bottom: 1px solid var(--line);
}

.drawer__title {
  font-size: 16px;
  font-weight: 600;
}

.drawer__subtitle {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--faint);
}

.drawer__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px calc(18px + var(--safe-right)) 24px 22px;
}

.drawer__foot {
  padding: 12px calc(18px + var(--safe-right)) calc(14px + var(--safe-bottom)) 22px;
  border-top: 1px solid var(--line);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.3s var(--ease);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
</style>
