<script setup>
import { computed, watch, onBeforeUnmount } from 'vue'
import { useUiStore } from '../stores/ui'
import { useModalGuard } from '../composables/useModalGuard'

const ui = useUiStore()

useModalGuard(computed(() => !!ui.dialog))

function onKey(e) {
  if (!ui.dialog) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    ui.settleDialog(false)
  }
  if (e.key === 'Enter') {
    e.stopPropagation()
    ui.settleDialog(true)
  }
}

watch(
  () => !!ui.dialog,
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
      <div v-if="ui.dialog" class="mask" @click.self="ui.settleDialog(false)">
        <Transition name="pop" appear>
          <div class="dialog" role="alertdialog" aria-modal="true">
            <h3 class="dialog__title">{{ ui.dialog.title }}</h3>
            <p class="dialog__message">{{ ui.dialog.message }}</p>
            <p v-if="ui.dialog.detail" class="dialog__detail">{{ ui.dialog.detail }}</p>
            <div class="dialog__actions">
              <button class="btn btn--ghost" @click="ui.settleDialog(false)">
                {{ ui.dialog.cancelText }}
              </button>
              <button
                class="btn"
                :class="ui.dialog.danger ? 'btn--danger' : 'btn--primary'"
                @click="ui.settleDialog(true)"
              >
                {{ ui.dialog.confirmText }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(24px + var(--safe-top)) calc(24px + var(--safe-right)) calc(24px + var(--safe-bottom))
    calc(24px + var(--safe-left));
  background: rgb(0 0 0 / 34%);
  backdrop-filter: blur(3px);
}

.dialog {
  width: min(420px, 100%);
  padding: 24px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  color: var(--fg);
  box-shadow: var(--shadow-lg);
}

.dialog__title {
  font-size: 17px;
  font-weight: 600;
}

.dialog__message {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--muted);
  word-break: break-word;
}

.dialog__detail {
  margin-top: 8px;
  padding: 9px 12px;
  font-size: 12.5px;
  line-height: 1.6;
  border-radius: 8px;
  background: var(--hover);
  color: var(--faint);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
