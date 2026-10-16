<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useShelfStore } from '../stores/shelf'
import { useUiStore } from '../stores/ui'
import { useModalGuard } from '../composables/useModalGuard'
import AppIcon from './AppIcon.vue'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const shelf = useShelfStore()
const ui = useUiStore()

useModalGuard(computed(() => props.open))

const title = ref('')
const content = ref('')
const busy = ref(false)
const textarea = ref(null)

/**
 * Esc 关闭。
 * 挂在 window 的捕获阶段，先把输入框里的 Esc 吃掉：这类对话框本身就要拦键盘，
 * 漏到底下会触发别处的快捷键。
 */
function onKey(e) {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      title.value = ''
      content.value = ''
      window.addEventListener('keydown', onKey, true)
      await nextTick()
      textarea.value?.focus()
    } else {
      window.removeEventListener('keydown', onKey, true)
    }
  }
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

async function submit() {
  const text = content.value
  if (!text.trim()) {
    ui.toast('请先粘贴文本内容', 'warn')
    return
  }
  busy.value = true
  try {
    await shelf.addText({
      title: title.value.trim() || `粘贴文本 ${new Date().toLocaleString('zh-CN')}`,
      text,
      encoding: 'utf-8',
      size: new Blob([text]).size
    })
    ui.toast('已加入书架', 'success')
    emit('close')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click.self="emit('close')">
        <Transition name="pop" appear>
          <div class="dialog">
            <header class="dialog__head">
              <div class="dialog__icon"><AppIcon name="edit" :size="18" /></div>
              <div>
                <h3>粘贴文本</h3>
                <p class="faint">适合从网页或聊天记录里复制一段文字来读</p>
              </div>
              <button class="icon-btn" @click="emit('close')"><AppIcon name="close" :size="18" /></button>
            </header>

            <div class="dialog__body">
              <label class="label">书名</label>
              <div class="field">
                <input v-model="title" placeholder="留空则自动命名" maxlength="60" />
              </div>

              <label class="label">内容</label>
              <textarea
                ref="textarea"
                v-model="content"
                class="field paste-area scroll-area"
                rows="10"
                placeholder="在这里粘贴文本…"
              />

              <p class="hint">
                将保存 <strong>{{ content.length.toLocaleString('zh-CN') }}</strong> 个字符
              </p>
            </div>

            <footer class="dialog__actions">
              <button class="btn btn--ghost" @click="emit('close')">取消</button>
              <button class="btn btn--primary" :disabled="busy || !content.trim()" @click="submit">
                <AppIcon name="check" :size="16" />
                加入书架
              </button>
            </footer>
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
  display: flex;
  flex-direction: column;
  width: min(620px, 100%);
  max-height: 88vh;
  /* 移动端地址栏收起/弹出会改变 vh，dvh 才是「看得见的那块高度」 */
  max-height: 88dvh;
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 16px 24px;
  border-bottom: 1px solid var(--line);
}

.dialog__head h3 {
  font-size: 16px;
  font-weight: 600;
}

.dialog__head p {
  margin-top: 3px;
  font-size: 12.5px;
}

.dialog__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}

.dialog__head > div:nth-child(2) {
  flex: 1;
}

.dialog__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px;
}

.label {
  display: block;
  margin-bottom: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.label:not(:first-child) {
  margin-top: 16px;
}

.paste-area {
  min-height: 200px;
  font-size: 13.5px;
}

/* 全局那条 16px 兜不住这里：.paste-area 是类选择器，优先于裸 textarea。
   13.5px 在 iOS 上聚焦会被自动放大整页，触摸设备统一提到 16px */
@media (pointer: coarse) {
  .paste-area {
    font-size: 16px;
  }
}

.hint {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--faint);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px 18px;
  border-top: 1px solid var(--line);
}
</style>
