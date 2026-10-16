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

/**
 * 挂载前先看看上次是不是正读着一本书 —— 阅读中刷新不该被弹回书架。
 * 正文在 IndexedDB 里，得等它读完再渲染，否则会先闪一下书架再切进阅读页；
 * 恢复失败（或本来就没书）也照常挂载，不能把页面卡成空白。
 */
async function boot() {
  try {
    await reader.resumeLastSession()
  } catch (err) {
    console.warn('[boot] 恢复上次的阅读会话失败：', err.message)
  }
  app.mount('#app')
}

boot()
