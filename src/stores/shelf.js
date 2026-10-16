import { defineStore } from 'pinia'
import { getText, putText, removeText, clearTexts } from '../utils/idb'
import { detectEncoding, formatChars } from '../utils/text'
import { formatOfFilename, parseBookChapters, countBookChars } from '../utils/markdown'
import { SAMPLE_TEXT, SAMPLE_TITLE } from '../utils/sample'
import { useUiStore } from './ui'

/**
 * 书籍元数据只放"小"字段；正文单独存 IndexedDB（见 utils/idb.js）。
 * format 决定正文怎么渲染，chapterSource 决定 Markdown 书的目录从哪来，
 * 取值分别是 'text' | 'markdown' 和 'heading' | 'plain'。
 */
function createBook({ title, encoding, size, text, format = 'text', chapterSource = 'heading' }) {
  const now = Date.now()
  return {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    title: (title || '未命名').trim() || '未命名',
    format,
    chapterSource,
    encoding,
    size,
    charCount: text.length,
    wordCount: countBookChars(text, format),
    chapterCount: parseBookChapters(text, format, chapterSource).length,
    createdAt: now,
    lastReadAt: null,
    readSeconds: 0,
    progress: { chapterIndex: 0, ratio: 0, percent: 0 },
    bookmarks: []
  }
}

export const useShelfStore = defineStore('shelf', {
  state: () => ({
    books: [],
    currentId: null,
    sortBy: 'recent', // recent | created | title | progress
    filter: ''
  }),

  getters: {
    sorted(state) {
      const list = state.books.slice()
      const key = state.filter.trim().toLowerCase()
      const filtered = key ? list.filter((b) => b.title.toLowerCase().includes(key)) : list
      const byRecent = (a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0) || b.createdAt - a.createdAt
      switch (state.sortBy) {
        case 'created':
          return filtered.sort((a, b) => b.createdAt - a.createdAt)
        case 'title':
          return filtered.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
        case 'progress':
          return filtered.sort((a, b) => (b.progress?.percent || 0) - (a.progress?.percent || 0))
        default:
          return filtered.sort(byRecent)
      }
    },
    totalWords: (state) => state.books.reduce((sum, b) => sum + (b.wordCount || 0), 0),
    readingCount: (state) => state.books.filter((b) => (b.progress?.percent || 0) > 0).length,
    finishedCount: (state) => state.books.filter((b) => (b.progress?.percent || 0) >= 0.999).length,
    totalSeconds: (state) => state.books.reduce((sum, b) => sum + (b.readSeconds || 0), 0),
    summary() {
      return `${this.books.length} 本 · 合计 ${formatChars(this.totalWords)}`
    }
  },

  actions: {
    book(id) {
      return this.books.find((b) => b.id === id) || null
    },

    /** 老数据没有 format 字段，一律按纯文本处理 */
    bookFormat(id) {
      return this.book(id)?.format || 'text'
    },

    /** Markdown 书的目录来源；老数据没有该字段，一律按 # 标题行 */
    bookChapterSource(id) {
      return this.book(id)?.chapterSource === 'plain' ? 'plain' : 'heading'
    },

    /** 切换渲染方式。字数与章节数由调用方（reader 持有正文）算好后带进来 */
    setFormat(id, format, patch = {}) {
      const target = this.book(id)
      if (!target) return
      target.format = format === 'markdown' ? 'markdown' : 'text'
      if (patch.wordCount) target.wordCount = patch.wordCount
      if (patch.chapterCount) target.chapterCount = patch.chapterCount
    },

    /** 切换目录来源。正文没变，所以字数不用重算，只有章节数要跟着改 */
    setChapterSource(id, source, patch = {}) {
      const target = this.book(id)
      if (!target) return
      target.chapterSource = source === 'plain' ? 'plain' : 'heading'
      if (patch.chapterCount) target.chapterCount = patch.chapterCount
    },

    /**
     * 导入若干本地文件。
     * 串行处理而不是 Promise.all：大文件同时解码会瞬间吃掉几百 MB 内存，
     * 而且逐个读可以逐个给反馈。
     */
    async importFiles(fileList) {
      const files = Array.from(fileList || [])
      if (!files.length) return 0
      const ui = useUiStore()
      let ok = 0
      let md = 0

      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer()
          const { encoding, text } = detectEncoding(buffer)
          if (!text.trim()) {
            ui.toast(`「${file.name}」是空文件，已跳过`, 'warn')
            continue
          }
          const format = formatOfFilename(file.name)
          if (format === 'markdown') md += 1
          await this.addText({
            title: file.name.replace(/\.[^.]+$/, ''),
            text,
            format,
            encoding,
            size: file.size
          })
          ok += 1
        } catch (err) {
          ui.toast(`读取「${file.name}」失败：${err.message}`, 'error')
        }
      }

      if (ok) {
        ui.toast(md ? `已导入 ${ok} 本书（${md} 本按 Markdown 渲染）` : `已导入 ${ok} 本书`, 'success')
      }
      return ok
    },

    async addText({ title, text, encoding = 'utf-8', size = 0, format = 'text' }) {
      const book = createBook({ title, encoding, size, text, format })
      await putText(book.id, text)
      this.books.unshift(book)
      return book
    },

    /**
     * 从 IndexedDB 取正文，找不到就顺手把这条脏元数据清掉。
     * drop = false 时只返回 null，不动书架 —— 启动时的自动恢复走这条路，
     * 存储不可用不该导致一本书被悄悄删掉。
     */
    async loadText(id, { drop = true } = {}) {
      const text = await getText(id)
      if (text == null) {
        if (!drop) return null
        const ui = useUiStore()
        const target = this.book(id)
        ui.toast(`「${target?.title || id}」的正文已丢失，请重新导入`, 'error')
        this.books = this.books.filter((b) => b.id !== id)
        if (this.currentId === id) this.currentId = null
        return null
      }
      return text
    },

    async remove(id) {
      await removeText(id)
      this.books = this.books.filter((b) => b.id !== id)
      if (this.currentId === id) this.currentId = null
    },

    async clearAll() {
      await clearTexts()
      this.books = []
      this.currentId = null
    },

    rename(id, title) {
      const target = this.book(id)
      const next = title.trim()
      if (target && next) target.title = next
    },

    setCurrent(id) {
      this.currentId = id
      const target = this.book(id)
      if (target) target.lastReadAt = Date.now()
    },

    saveProgress(id, progress) {
      const target = this.book(id)
      if (!target) return
      target.progress = { ...progress }
      target.lastReadAt = Date.now()
    },

    addReadSeconds(id, seconds) {
      const target = this.book(id)
      if (!target || seconds <= 0) return
      target.readSeconds = (target.readSeconds || 0) + seconds
    },

    addBookmark(id, bookmark) {
      const target = this.book(id)
      if (!target) return
      target.bookmarks.unshift(bookmark)
      if (target.bookmarks.length > 200) target.bookmarks.length = 200
    },

    removeBookmark(id, bookmarkId) {
      const target = this.book(id)
      if (!target) return
      target.bookmarks = target.bookmarks.filter((m) => m.id !== bookmarkId)
    },

    async loadSample() {
      const existing = this.books.find((b) => b.title === SAMPLE_TITLE)
      if (existing) return existing
      const book = await this.addText({
        title: SAMPLE_TITLE,
        text: SAMPLE_TEXT,
        encoding: 'utf-8',
        size: new Blob([SAMPLE_TEXT]).size
      })
      useUiStore().toast('示例书籍已加入书架', 'success')
      return book
    }
  }
})
