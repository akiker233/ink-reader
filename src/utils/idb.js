/**
 * 正文持久化层。
 *
 * 为什么用 IndexedDB 而不是 localStorage：
 * localStorage 是同步 API 且配额通常只有 5MB，一本小说动辄 2~10MB，
 * 塞进去会直接 QuotaExceededError，而且同步读写会阻塞主线程。
 * 这里只存正文（大对象），书籍元数据仍然放在 localStorage（小、同步、启动即可渲染）。
 *
 * 同时保留一份内存兜底：隐私模式下 IndexedDB 可能打不开，此时退化为「仅本次会话可读」，
 * 不影响其余功能可用。
 */
const DB_NAME = 'ink-reader'
const DB_VERSION = 1
const STORE = 'texts'

const memory = new Map()
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('打开 IndexedDB 失败'))
    req.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用'))
  }).catch((err) => {
    console.warn('[idb] 降级为内存存储：', err.message)
    return null
  })
  return dbPromise
}

function run(mode, fn) {
  return openDB().then((db) => {
    if (!db) return Promise.reject(new Error('IndexedDB 不可用'))
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      let request
      try {
        request = fn(tx.objectStore(STORE))
      } catch (err) {
        reject(err)
        return
      }
      tx.oncomplete = () => resolve(request ? request.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('事务被中断'))
    })
  })
}

export async function putText(id, text) {
  try {
    await run('readwrite', (store) => store.put({ id, text }))
    memory.delete(id)
  } catch {
    memory.set(id, text)
  }
}

export async function getText(id) {
  try {
    const record = await run('readonly', (store) => store.get(id))
    if (record && typeof record.text === 'string') return record.text
  } catch {
    /* 落到内存兜底 */
  }
  return memory.has(id) ? memory.get(id) : null
}

export async function removeText(id) {
  memory.delete(id)
  try {
    await run('readwrite', (store) => store.delete(id))
  } catch {
    /* 已经不在持久层里就算了 */
  }
}

export async function clearTexts() {
  memory.clear()
  try {
    await run('readwrite', (store) => store.clear())
  } catch {
    /* 忽略 */
  }
}

/** 剩余配额估算，用于在导入前给出友好提示（不可用时返回 null） */
export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}
