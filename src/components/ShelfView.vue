<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useShelfStore } from '../stores/shelf'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { useTouch } from '../composables/useTouch'
import { formatChars, formatDuration } from '../utils/text'
import AppIcon from './AppIcon.vue'
import BookCard from './BookCard.vue'
import PasteDialog from './PasteDialog.vue'

const shelf = useShelfStore()
const reader = useReaderStore()
const ui = useUiStore()
const { sortBy, filter } = storeToRefs(shelf)

// 触摸设备上没有「拖文件进来」这回事，空状态和页脚的引导文案要换个说法
const { isTouch } = useTouch()

const fileInput = ref(null)
const pasteOpen = ref(false)
const showStats = ref(false)

const SORTS = [
  { id: 'recent', name: '最近阅读' },
  { id: 'created', name: '导入时间' },
  { id: 'title', name: '书名' },
  { id: 'progress', name: '阅读进度' }
]

function pickFiles() {
  fileInput.value?.click()
}

async function onFiles(event) {
  const files = event.target.files
  await shelf.importFiles(files)
  event.target.value = ''
}

async function onRemove(book) {
  const ok = await ui.confirm({
    title: '从书架移除',
    message: `确定要移除「${book.title}」吗？`,
    detail: `本地保存的正文（${formatChars(book.wordCount)}）和这本书的阅读进度、书签会一起删除，无法恢复。`,
    confirmText: '移除',
    danger: true
  })
  if (!ok) return
  await shelf.remove(book.id)
  ui.toast('已移除', 'success')
}

async function startSample() {
  const book = await shelf.loadSample()
  if (book) reader.openBook(book.id)
}
</script>

<template>
  <div class="shelf scroll-area">
    <header class="head">
      <div class="brand">
        <div class="brand__mark"><AppIcon name="books" :size="22" /></div>
        <div>
          <h1 class="brand__name">墨读</h1>
          <p class="brand__tag">纯前端 TXT 阅读器 · 内容只留在你的浏览器里</p>
        </div>
      </div>

      <div class="head__actions">
        <div class="field search">
          <AppIcon name="search" :size="15" />
          <input v-model="filter" placeholder="搜索书名" />
        </div>

        <select v-model="sortBy" class="field select-sort" title="排序方式">
          <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>

        <button class="btn btn--ghost" title="粘贴一段文本" @click="pasteOpen = true">
          <AppIcon name="edit" :size="16" />
          <span class="hide-sm">粘贴</span>
        </button>

        <button class="btn btn--primary" @click="pickFiles">
          <AppIcon name="upload" :size="16" />
          导入文件
        </button>

        <button class="icon-btn" title="阅读设置 (s)" @click="reader.openPanel('settings')">
          <AppIcon name="sliders" :size="18" />
        </button>

        <input
          ref="fileInput"
          class="hidden-input"
          type="file"
          accept=".txt,.text,.md,.log,text/plain,text/markdown"
          multiple
          @change="onFiles"
        />
      </div>
    </header>

    <div class="stats">
      <div class="stats__main">
        <span><strong>{{ shelf.books.length }}</strong> 本</span>
        <i class="dot" />
        <span>合计 <strong>{{ formatChars(shelf.totalWords) }}</strong></span>
        <i class="dot" />
        <span>在读 <strong>{{ shelf.readingCount }}</strong> 本</span>
        <i class="dot" />
        <span>已读完 <strong>{{ shelf.finishedCount }}</strong> 本</span>
        <template v-if="shelf.totalSeconds > 60">
          <i class="dot" />
          <span>累计阅读 <strong>{{ formatDuration(shelf.totalSeconds) }}</strong></span>
        </template>
      </div>
      <button class="link-btn" @click="showStats = !showStats">
        {{ showStats ? '收起说明' : '数据存在哪？' }}
      </button>
    </div>

    <Transition name="fade">
      <div v-if="showStats" class="explain">
        <p>
          所有内容都保存在<strong>你自己的浏览器</strong>里，没有服务器、没有账号、不会上传：
        </p>
        <ul>
          <li><b>正文</b> → IndexedDB（容量大、异步读写，一本小说几 MB 也没问题）</li>
          <li><b>书架信息、阅读设置、进度、书签</b> → localStorage（体积小、同步读取，打开页面即可渲染）</li>
        </ul>
        <p class="faint">
          换一台设备或清空浏览器数据后，书架是空的 —— 这是这个设计的代价，也是内容不外泄的原因。
          书籍列表右上角的删除按钮会同时清掉这两处数据。
        </p>
      </div>
    </Transition>

    <main class="grid-wrap">
      <TransitionGroup v-if="shelf.sorted.length" tag="div" name="card" class="grid">
        <BookCard
          v-for="book in shelf.sorted"
          :key="book.id"
          :book="book"
          @open="reader.openBook"
          @remove="onRemove"
        />
      </TransitionGroup>

      <div v-else class="empty">
        <div class="empty__icon"><AppIcon name="book" :size="34" :stroke="1.3" /></div>
        <h2 v-if="shelf.books.length">没有匹配的书</h2>
        <h2 v-else>书架还是空的</h2>
        <p v-if="shelf.books.length" class="muted">换个关键词试试，或者清空搜索框。</p>
        <p v-else-if="isTouch" class="muted">
          点下面的按钮选 .txt / .md 文件，或者用「粘贴」导入一段文字。<br />
          支持自动识别 UTF-8 / GBK / GB18030 / Big5 / UTF-16 编码。
        </p>
        <p v-else class="muted">
          把 .txt 文件拖到窗口里，或者点下面的按钮。<br />
          支持自动识别 UTF-8 / GBK / GB18030 / Big5 / UTF-16 编码。
        </p>
        <div class="empty__actions">
          <button class="btn btn--primary" @click="pickFiles">
            <AppIcon name="upload" :size="16" />
            导入文件
          </button>
          <button class="btn" @click="startSample">
            <AppIcon name="book" :size="16" />
            载入示例书籍
          </button>
        </div>
      </div>
    </main>

    <footer class="foot faint">
      <span>{{ isTouch ? '导入文件后点击书封开始阅读' : '拖入文件即可导入 · 点击书封开始阅读' }}</span>
      <button class="link-btn" @click="reader.openPanel('settings')">阅读设置</button>
    </footer>

    <PasteDialog :open="pasteOpen" @close="pasteOpen = false" />
  </div>
</template>

<style scoped>
.shelf {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: calc(30px + var(--safe-top)) calc(clamp(20px, 4vw, 52px) + var(--safe-right))
    calc(40px + var(--safe-bottom)) calc(clamp(20px, 4vw, 52px) + var(--safe-left));
}

/* ---- 头部 ---- */
.head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 13px;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 13px;
  background: var(--accent);
  color: var(--accent-contrast);
  box-shadow: var(--shadow-sm);
}

.brand__name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.brand__tag {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--faint);
}

.head__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search {
  width: 190px;
  color: var(--faint);
}

.search input {
  color: var(--fg);
}

.select-sort {
  width: 122px;
}

.hidden-input {
  display: none;
}

/* ---- 统计条 ---- */
.stats {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 26px;
  padding: 12px 16px;
  border-radius: var(--radius);
  background: var(--panel);
  border: 1px solid var(--line);
}

.stats__main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--muted);
}

.stats__main strong {
  color: var(--fg);
  font-weight: 600;
}

.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--faint);
}

.link-btn {
  font-size: 12.5px;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
}

.explain {
  margin-top: 12px;
  padding: 16px 18px;
  border-radius: var(--radius);
  background: var(--panel);
  border: 1px solid var(--line);
  font-size: 13px;
  line-height: 1.85;
  color: var(--muted);
}

.explain strong,
.explain b {
  color: var(--fg);
}

.explain ul {
  margin: 8px 0;
  padding-left: 4px;
}

.explain li {
  position: relative;
  padding-left: 15px;
}

.explain li::before {
  content: "";
  position: absolute;
  top: 0.72em;
  left: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

/* ---- 网格 ---- */
.grid-wrap {
  flex: 1 0 auto;
  margin-top: 26px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: clamp(18px, 2.4vw, 30px);
}

.card-enter-active,
.card-leave-active {
  transition: opacity 0.3s var(--ease), transform 0.3s var(--ease);
}

.card-enter-from,
.card-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}

.card-leave-active {
  position: absolute;
}

.card-move {
  transition: transform 0.35s var(--ease);
}

/* ---- 空状态 ---- */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: clamp(40px, 9vh, 90px) 20px;
}

.empty__icon {
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  border-radius: 22px;
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--faint);
}

.empty h2 {
  margin-top: 20px;
  font-size: 17px;
  font-weight: 600;
}

.empty p {
  margin-top: 9px;
  font-size: 13px;
  line-height: 1.8;
  max-width: 420px;
}

.empty__actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
  flex-wrap: wrap;
  justify-content: center;
}

/* ---- 页脚 ---- */
.foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 44px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 12px;
}

/* 窄屏时头部整体竖排：品牌一行、操作区一行占满，避免按钮被挤到自己换行 */
@media (max-width: 900px) {
  .head {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .head__actions {
    width: 100%;
  }

  .search {
    flex: 1;
    width: auto;
    min-width: 110px;
  }
}

/* 只有「窄屏 + 有指针」才把「粘贴」二字收掉：
   触摸设备上没有 hover 提示，按钮光剩个图标没人认得出是什么 */
@media (max-width: 720px) and (hover: hover) {
  .hide-sm {
    display: none;
  }
}

@media (max-width: 720px) {
  .select-sort {
    width: 104px;
  }
}
</style>
