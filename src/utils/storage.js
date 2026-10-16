/**
 * localStorage 封装 + Pinia 持久化插件。
 *
 * 这里存的是「小且需要同步读到」的数据：书架元数据、阅读设置、阅读进度。
 * 正文不在这里（见 utils/idb.js 的注释）。
 */
const PREFIX = 'ink-reader:'

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch (err) {
    console.warn('[storage] 写入失败：', err.message)
    return false
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* 忽略 */
  }
}

/**
 * 把一个 store 的全部 state 持久化。
 * - 启动时 $patch 回灌（用 $patch 而不是直接赋值，避免局部字段覆盖掉新版本新增的默认值）；
 * - 运行时用 $subscribe 监听，300ms 去抖后整体写回（拖字号滑块这种高频操作不会写爆 localStorage）。
 * 返回一个 flush 函数，在页面卸载时抢救一次未落盘的数据。
 */
export function persistStore(store, key, { delay = 300 } = {}) {
  const saved = readJSON(key, null)
  if (saved && typeof saved === 'object') {
    try {
      store.$patch(saved)
    } catch (err) {
      console.warn(`[storage] ${key} 恢复失败：`, err.message)
    }
  }

  let timer = null
  let dirty = false

  const write = () => {
    timer = null
    dirty = false
    writeJSON(key, store.$state)
  }

  store.$subscribe(
    () => {
      dirty = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(write, delay)
    },
    { detached: true, flush: 'post' }
  )

  return () => {
    if (timer) clearTimeout(timer)
    if (dirty) write()
  }
}
