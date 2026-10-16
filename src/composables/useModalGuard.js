import { onBeforeUnmount, watch } from 'vue'
import { useUiStore } from '../stores/ui'

/**
 * 声明「本组件当前是否占据了一层浮层」。
 *
 * 阅读器把快捷键挂在 window 上，浮层打开时如果不让路，
 * 在检索输入框里打字就会同时触发翻页/切主题。这里统一计数，
 * 阅读器读到 modalCount > 0 就直接忽略按键。
 */
export function useModalGuard(isOpen) {
  const ui = useUiStore()
  let held = false

  const set = (open) => {
    if (open && !held) {
      held = true
      ui.holdModal()
    } else if (!open && held) {
      held = false
      ui.releaseModal()
    }
  }

  watch(isOpen, set, { immediate: true })
  onBeforeUnmount(() => set(false))
}
