import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/main.css'
import { useSettingsStore } from './stores/settings'
import { useShelfStore } from './stores/shelf'
import { useReaderStore } from './stores/reader'
import { persistStore } from './utils/storage'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

/**
 * 状态恢复 / 持久化在这里统一挂载，store 本身不关心存储。
 * 顺序有讲究：先恢复设置（书架立即按用户的配色渲染），再恢复书架。
 */
const flushers = []

const settings = useSettingsStore()
const shelf = useShelfStore()
const reader = useReaderStore()

flushers.push(persistStore(settings, 'settings'))
flushers.push(persistStore(shelf, 'shelf'))

// 恢复上次读的书序号（正文还在 IndexedDB 里，等用户点进去再按需读取）
const lastBookId = shelf.currentId
if (lastBookId && !shelf.book(lastBookId)) shelf.currentId = null

// 关页面前抢救一次未落盘的数据
window.addEventListener('pagehide', () => {
  reader.flushProgress()
  reader.flushSession()
  flushers.forEach((flush) => flush())
})

app.mount('#app')
