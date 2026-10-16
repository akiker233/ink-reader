import { defineStore } from 'pinia'
import { findChapterIndex, searchText, toParagraphs } from '../utils/text'
import { renderMarkdown, parseBookChapters, countBookChars, stripMarkdown } from '../utils/markdown'
import { useShelfStore } from './shelf'
import { useUiStore } from './ui'

const SAVE_DEBOUNCE = 400
const FLUSH_INTERVAL = 15

/**
 * 阅读会话。
 *
 * 这里存的是"当前正在读什么、读到哪"，以及衍生的统计。
 * 数据流是单向的：reader 依赖 shelf（读写进度/书签），shelf 不反向依赖 reader。
 *
 * 位置模型：chapterIndex（第几章） + ratio（章内滚动比例 0~1）。
 * 不用"第几页"，因为页数会随字号/行距/窗口宽度变化，而章内比例是相对量，
 * 换字号重开也能落回同一段附近。
 * 视口内真正的"视线落点"由视图层用段落锚点补正（见 ReaderView 的 reflow）。
 */
export const useReaderStore = defineStore('reader', {
  state: () => ({
    view: 'shelf', // shelf | reader
    bookId: null,
    title: '',
    text: '',
    chapters: [],
    chapterIndex: 0,
    ratio: 0,
    loading: false,
    scrollToken: 0, // 每次显式跳转 +1，视图据此重新执行滚动定位

    // 侧栏
    activePanel: null, // catalog | bookmarks | search | settings | null
    navTab: 'catalog',

    // 检索
    query: '',
    results: [],

    // 本次会话
    sessionSeconds: 0,
    toolbarVisible: true,
    startedAt: 0
  }),

  getters: {
    book() {
      return useShelfStore().book(this.bookId)
    },
    /** 当前这本书该按纯文本还是 Markdown 渲染 */
    format() {
      return useShelfStore().bookFormat(this.bookId)
    },
    chapter(state) {
      return state.chapters[state.chapterIndex] || null
    },
    chapterTitle() {
      return this.chapter?.title || ''
    },
    chapterHtml(state) {
      if (!this.chapter) return ''
      // 从 head 取正文：start 处的标题行由页面单独渲染，避免屏幕上出现两遍标题
      const raw = state.text.slice(this.chapter.head, this.chapter.end)
      return this.format === 'markdown'
        ? renderMarkdown(raw, { query: state.query })
        : toParagraphs(raw, state.query)
    },
    /** 全书字符下标 */
    offset(state) {
      if (!this.chapter) return 0
      const span = this.chapter.end - this.chapter.start
      return Math.min(state.text.length, Math.round(this.chapter.start + span * state.ratio))
    },
    percent() {
      if (!this.text.length) return 0
      return Math.min(1, this.offset / this.text.length)
    },
    offsetInChapter(state) {
      if (!this.chapter) return 0
      return Math.max(0, this.offset - this.chapter.start)
    },
    wordCount() {
      return countBookChars(this.text, this.format)
    },
    readWords() {
      return Math.round(this.wordCount * this.percent)
    },
    /** 平均速度：只用本次会话算，避免把以前挂机的时间摊进来 */
    speed() {
      if (this.sessionSeconds < 60) return 0
      return Math.round(this.readWords / (this.sessionSeconds / 60))
    },
    remainMinutes() {
      if (!this.speed) return null
      const left = this.wordCount - this.readWords
      return Math.max(0, Math.round(left / this.speed))
    },
    bookmarks() {
      return this.book?.bookmarks || []
    },
    percentText() {
      return `${(this.percent * 100).toFixed(1)}%`
    }
  },

  actions: {
    async openBook(id) {
      const shelf = useShelfStore()
      const meta = shelf.book(id)
      if (!meta) return

      this.loading = true
      try {
        const text = await shelf.loadText(id)
        if (text == null) return

        this.bookId = id
        this.title = meta.title
        this.text = text
        this.chapters = parseBookChapters(text, meta.format || 'text')

        const p = meta.progress || {}
        this.chapterIndex = Math.min(Math.max(0, p.chapterIndex || 0), this.chapters.length - 1)
        this.ratio = Math.min(1, Math.max(0, p.ratio || 0))

        this.query = ''
        this.results = []
        this.activePanel = null
        this.navTab = 'catalog'
        this.sessionSeconds = 0
        this._flushed = 0
        this.startedAt = Date.now()
        this.toolbarVisible = true
        this.scrollToken += 1

        shelf.setCurrent(id)
        this.view = 'reader'
        this.startTimer()
      } finally {
        this.loading = false
      }
    },

    closeBook() {
      this.flushSession()
      this.stopTimer()
      this.view = 'shelf'
      this.activePanel = null
      this.text = ''
      this.chapters = []
      this.results = []
      this.query = ''
      this.bookId = null
      this.title = ''
    },

    goChapter(index, ratio = 0) {
      const next = Math.min(this.chapters.length - 1, Math.max(0, index))
      this.chapterIndex = next
      this.ratio = Math.min(1, Math.max(0, ratio))
      this.scrollToken += 1
      this.saveProgress()
    },

    nextChapter() {
      if (this.chapterIndex < this.chapters.length - 1) this.goChapter(this.chapterIndex + 1, 0)
      else useUiStore().toast('已经是最后一章了', 'info')
    },

    prevChapter() {
      if (this.chapterIndex > 0) this.goChapter(this.chapterIndex - 1, 1)
    },

    /** 跳转到全文字符下标（检索结果、书签都用它） */
    goOffset(offset) {
      const index = findChapterIndex(this.chapters, offset)
      const chapter = this.chapters[index]
      const span = Math.max(1, chapter.end - chapter.start)
      this.chapterIndex = index
      this.ratio = Math.min(1, Math.max(0, (offset - chapter.start) / span))
      this.scrollToken += 1
      this.saveProgress()
    },

    setRatio(value) {
      this.ratio = Math.min(1, Math.max(0, value))
    },

    /**
     * 切换「纯文本 / Markdown」渲染。存的是原文，所以不必重新导入。
     * 换格式会换一套章节边界，原先的章内比例可能落到别的章上，
     * 因此按「全文字符下标」重新定位，而不是沿用比例。
     */
    setBookFormat(format) {
      const shelf = useShelfStore()
      if (!this.bookId || !this.text) return
      const next = format === 'markdown' ? 'markdown' : 'text'
      if (shelf.bookFormat(this.bookId) === next) return

      const offset = this.offset
      this.chapters = parseBookChapters(this.text, next)
      shelf.setFormat(this.bookId, next, {
        wordCount: countBookChars(this.text, next),
        chapterCount: this.chapters.length
      })
      this.goOffset(offset)
      useUiStore().toast(next === 'markdown' ? '已按 Markdown 渲染' : '已按纯文本渲染', 'success')
    },

    saveProgress() {
      if (!this.bookId) return
      if (this._saveTimer) clearTimeout(this._saveTimer)
      this._saveTimer = setTimeout(() => this.flushProgress(), SAVE_DEBOUNCE)
    },

    flushProgress() {
      if (!this.bookId) return
      this._saveTimer = null
      useShelfStore().saveProgress(this.bookId, {
        chapterIndex: this.chapterIndex,
        ratio: this.ratio,
        percent: this.percent,
        offset: this.offset,
        at: Date.now()
      })
    },

    // ---- 阅读时长 ----
    startTimer() {
      this.stopTimer()
      this._timer = setInterval(() => {
        // 只在页面可见时计时：后台挂着的标签页不该算作阅读时间
        if (document.visibilityState === 'visible') {
          this.sessionSeconds += 1
          if (this.sessionSeconds % FLUSH_INTERVAL === 0) this.flushSession()
        }
      }, 1000)
    },

    stopTimer() {
      if (this._timer) clearInterval(this._timer)
      this._timer = null
    },

    /** 把「本次会话里还没落盘的秒数」增量写回书架，避免重复累计 */
    flushSession() {
      if (!this.bookId || !this.sessionSeconds) return
      const delta = this.sessionSeconds - (this._flushed || 0)
      if (delta <= 0) return
      this._flushed = this.sessionSeconds
      useShelfStore().addReadSeconds(this.bookId, delta)
    },

    // ---- 检索 ----
    runSearch(query) {
      this.query = query
      if (!query.trim()) {
        this.results = []
        return
      }
      const hits = searchText(this.text, query, this.chapters, 200)
      // Markdown 书的摘要里会混进 # * ` 这些标记，展示前先擦掉
      this.results =
        this.format === 'markdown'
          ? hits.map((hit) => ({ ...hit, before: stripMarkdown(hit.before), after: stripMarkdown(hit.after) }))
          : hits
    },

    clearSearch() {
      this.query = ''
      this.results = []
    },

    openPanel(panel) {
      this.activePanel = this.activePanel === panel ? null : panel
      if (panel === 'catalog' || panel === 'bookmarks' || panel === 'search') this.navTab = panel
    },

    closePanel() {
      this.activePanel = null
    },

    // ---- 书签 ----
    addBookmarkAtCurrentPosition() {
      if (!this.bookId || !this.chapter) return
      const bookmark = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        offset: this.offset,
        chapterIndex: this.chapterIndex,
        chapterTitle: this.chapterTitle,
        percent: this.percent,
        excerpt: this.text.slice(this.offset, this.offset + 40).replace(/\s+/g, ' ').trim() || this.chapterTitle,
        createdAt: Date.now()
      }
      useShelfStore().addBookmark(this.bookId, bookmark)
      this.saveProgress()
      useUiStore().toast('已添加书签', 'success')
    },

    removeBookmark(bookmarkId) {
      if (!this.bookId) return
      useShelfStore().removeBookmark(this.bookId, bookmarkId)
    }
  }
})
