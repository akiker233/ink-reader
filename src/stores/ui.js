import { defineStore } from 'pinia'

let seq = 0

/**
 * 全局 UI 状态：轻提示、确认框、拖拽遮罩。
 * 确认框做成 Promise 形式（await ui.confirm(...) 拿布尔值），
 * 调用方就不用为每个弹窗再维护一份 "showXxx" 状态了。
 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [],
    dialog: null,
    dragging: false,
    /** 当前打开了多少层浮层。阅读器的全局快捷键据此让路，避免「在输入框里打字触发翻页」。 */
    modalCount: 0
  }),

  actions: {
    holdModal() {
      this.modalCount += 1
    },
    releaseModal() {
      this.modalCount = Math.max(0, this.modalCount - 1)
    },

    toast(message, type = 'info', duration = 2800) {
      const id = (seq += 1)
      this.toasts.push({ id, message, type })
      setTimeout(() => this.dismissToast(id), duration)
      return id
    },

    dismissToast(id) {
      const i = this.toasts.findIndex((t) => t.id === id)
      if (i > -1) this.toasts.splice(i, 1)
    },

    /** 用法：if (await ui.confirm({ message: '删除这本书？' })) { ... } */
    confirm(options) {
      const opts = typeof options === 'string' ? { message: options } : options
      return new Promise((resolve) => {
        this.dialog = {
          title: opts.title || '请确认',
          message: opts.message || '',
          detail: opts.detail || '',
          confirmText: opts.confirmText || '确定',
          cancelText: opts.cancelText || '取消',
          danger: !!opts.danger,
          resolve
        }
      })
    },

    settleDialog(value) {
      const dialog = this.dialog
      this.dialog = null
      if (dialog) dialog.resolve(value)
    }
  }
})
