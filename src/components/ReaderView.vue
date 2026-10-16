<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useTouch } from '../composables/useTouch'
import { formatChars } from '../utils/text'
import AppIcon from './AppIcon.vue'
import ReaderToolbar from './ReaderToolbar.vue'
import NavPanel from './NavPanel.vue'

const reader = useReaderStore()
const settings = useSettingsStore()
const ui = useUiStore()

const scrollEl = ref(null)
const atEnd = ref(false)
const flash = ref(false)

const topPercent = computed(() => `${(reader.percent * 100).toFixed(2)}%`)
const isLastChapter = computed(() => reader.chapterIndex >= reader.chapters.length - 1)

/* ---------------- 滚动 ↔ 进度 ---------------- */

/**
 * 章节内容比视口还短时没有滚动量，此时位置无法用比例表达：
 * 只在最后一章视为「已读完」，否则停留在章首，避免进度虚高。
 */
function readRatio() {
  const el = scrollEl.value
  if (!el) return reader.ratio
  const max = el.scrollHeight - el.clientHeight
  if (max <= 4) return isLastChapter.value ? 1 : 0
  return Math.min(1, Math.max(0, el.scrollTop / max))
}

function onScroll() {
  const el = scrollEl.value
  if (el && isTouch.value) onTouchScroll(el)
  reader.setRatio(readRatio())
  reader.saveProgress()
  atEnd.value = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 80 : false
}

/** 把「章序号 + 章内比例」还原成真实滚动位置 */
async function applyScroll() {
  await nextTick()
  const el = scrollEl.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  el.scrollTop = reader.ratio * Math.max(0, max)
  // 程序化跳转也会触发 scroll 事件，先同步基准值，别让它被当成「用户往下滚」而收起工具条
  lastScrollTop = el.scrollTop
  atEnd.value = max <= 4
  // 内容不足一屏时不会触发 scroll 事件，比例无从推算：
  // 最后一章视为读完（否则短书永远到不了 100%），其余章节保持原位置
  if (max <= 4 && isLastChapter.value) reader.setRatio(1)
}

/**
 * 记下视口顶部落在哪一段、以及段内偏了多少像素。
 * 换字号会让整章重新折行，按「比例」还原只能保证进度数字不变，
 * 段落本身会漂到别处；有了这个锚点才能把眼睛正看的那一段钉在原位。
 */
function captureAnchor(el) {
  const nodes = el.querySelectorAll('.page__body > *')
  const line = el.getBoundingClientRect().top + 6
  for (let i = 0; i < nodes.length; i++) {
    const rect = nodes[i].getBoundingClientRect()
    if (rect.bottom <= line) continue
    // 视口顶部还停在正文之前（标题、章信息露着），没有段落可锚，交给比例还原
    if (rect.top > line) return null
    return { i, delta: line - rect.top }
  }
  return null
}

function restoreAnchor(el, anchor) {
  const node = el.querySelectorAll('.page__body > *')[anchor.i]
  if (!node) return applyScroll()
  // 目标：让该段段顶停在「视口顶 + 6 - delta」处，故滚动量 = 当前段顶 - 目标位置
  el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top - 6 + anchor.delta
  atEnd.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

async function reflow() {
  const el = scrollEl.value
  const anchor = el ? captureAnchor(el) : null
  await nextTick()
  requestAnimationFrame(() => (anchor ? restoreAnchor(el, anchor) : applyScroll()))
}

watch(() => [reader.chapterIndex, reader.scrollToken], applyScroll)
watch(
  () => [
    settings.fontSize,
    settings.lineHeight,
    settings.pageWidth,
    settings.letterSpacing,
    settings.fontFamily,
    settings.indent
  ],
  reflow
)

/* ---------------- 工具条自动显隐 ---------------- */

const { isTouch } = useTouch()

// 鼠标设备：按指针纵向位置判断，而不是按滚动方向 —— 触控板惯性滚动时方向判断容易抖动
function onPointerMove(e) {
  if (isTouch.value || settings.keepToolbarOpen) return
  if (e.clientY < 86) reader.toolbarVisible = true
  else if (e.clientY > 150) reader.toolbarVisible = false
}

/*
 * 触摸设备没有指针位置可依据，改成按滚动方向：
 * 下滚（正在看正文）收起工具条，上滚（多是在找导航）展开。
 * 展开后再过一次静置延时自动收起，免得停在那儿一直占着顶部。
 */
const TOOLBAR_IDLE = 2600
let idleTimer = null
let lastScrollTop = 0

function scheduleHide() {
  clearTimeout(idleTimer)
  if (settings.keepToolbarOpen) return
  idleTimer = setTimeout(() => {
    // 浮层开着时工具条只是背景，收起它会连「更多」菜单一起抽走
    if (ui.modalCount === 0) reader.toolbarVisible = false
  }, TOOLBAR_IDLE)
}

function onTouchScroll(el) {
  const delta = el.scrollTop - lastScrollTop
  lastScrollTop = el.scrollTop
  if (settings.keepToolbarOpen) {
    reader.toolbarVisible = true
    clearTimeout(idleTimer)
    return
  }
  // 惯性滚动、回弹会带出 1px 级别的抖动，忽略掉，否则工具条一闪一闪
  if (Math.abs(delta) < 2) return
  if (ui.modalCount > 0) return
  if (delta > 0) {
    reader.toolbarVisible = false
    clearTimeout(idleTimer)
  } else {
    reader.toolbarVisible = true
    scheduleHide()
  }
}

// 常驻开关：打开时立刻展开并停掉延时，关掉后由下一次滚动重新接管
watch(
  () => settings.keepToolbarOpen,
  (keep) => {
    if (keep) {
      clearTimeout(idleTimer)
      reader.toolbarVisible = true
    } else if (isTouch.value) {
      scheduleHide()
    }
  }
)

function scrollBy(delta) {
  scrollEl.value?.scrollBy({ top: delta, behavior: 'smooth' })
}

/* ---------------- 快捷键 ---------------- */

function onKey(e) {
  // 焦点在输入框里时一律让路，否则会在检索框里打字时触发翻章
  const tag = (e.target?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
  if (e.metaKey || e.ctrlKey || e.altKey) return

  /*
   * 面板与外观类快捷键在浮层打开时依然生效：
   * 这样才能「按 C 看目录 → 按 / 直接切成检索 → 按 S 调排版」一路按下去，
   * 也方便在面板里用 +/- 实时看字号变化。
   */
  switch (e.key) {
    case '/':
      e.preventDefault()
      reader.openPanel('search')
      return
    case 'c':
      reader.openPanel('catalog')
      return
    case 'b':
      reader.openPanel('bookmarks')
      return
    case 's':
      reader.openPanel('settings')
      return
    case 'e':
      settings.toggleEyeCare()
      showFlash(settings.eyeCare ? '护眼模式 开' : '护眼模式 关')
      return
    case 't':
      settings.cycleTheme()
      return
    case '+':
    case '=':
      settings.stepFontSize(1)
      showFlash(`字号 ${settings.fontSize}`)
      return
    case '-':
    case '_':
      settings.stepFontSize(-1)
      showFlash(`字号 ${settings.fontSize}`)
      return
    default:
      break
  }

  // 翻章与滚动会让抽屉后面的正文乱动，浮层打开时让路
  if (ui.modalCount > 0) return

  /*
   * 抽屉和对话框在捕获阶段就 stopPropagation 了，事件根本走不到这里，
   * 所以能落到这一行的 Esc 一定是「退出阅读」，与工具栏的「书架」按钮同一个动作。
   */
  if (e.key === 'Escape') {
    reader.closeBook()
    return
  }

  const page = (scrollEl.value?.clientHeight || 600) * 0.86
  switch (e.key) {
    case 'ArrowRight':
      reader.nextChapter()
      break
    case 'ArrowLeft':
      reader.prevChapter()
      break
    case 'ArrowDown':
      scrollBy(page * 0.34)
      break
    case 'ArrowUp':
      scrollBy(-page * 0.34)
      break
    case ' ':
    case 'PageDown':
      e.preventDefault()
      scrollBy(page)
      break
    case 'PageUp':
      e.preventDefault()
      scrollBy(-page)
      break
    case 'Home':
      reader.goChapter(reader.chapterIndex, 0)
      break
    case 'End':
      reader.goChapter(reader.chapterIndex, 1)
      break
    default:
      break
  }
}

let flashTimer = null
function showFlash(text) {
  flash.value = text
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = false), 1200)
}

/* ---------------- 生命周期 ---------------- */

function persistNow() {
  reader.flushProgress()
  reader.flushSession()
}

// 切标签页 / 关页面时立刻落盘，避免去抖窗口里丢掉最后一段进度
function onVisibilityChange() {
  if (document.visibilityState === 'hidden') persistNow()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', persistNow)
  document.addEventListener('visibilitychange', onVisibilityChange)
  applyScroll()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pagehide', persistNow)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearTimeout(flashTimer)
  clearTimeout(idleTimer)
  persistNow()
})
</script>

<template>
  <div class="reader" @mousemove="onPointerMove">
    <ReaderToolbar />

    <div ref="scrollEl" class="reader__scroll scroll-area" @scroll.passive="onScroll">
      <article class="page" :style="settings.typographyVars">
        <h2 class="page__title">{{ reader.chapterTitle }}</h2>
        <div class="page__meta faint">
          <span>{{ formatChars(reader.chapter.end - reader.chapter.head) }}</span>
          <span>·</span>
          <span>第 {{ reader.chapterIndex + 1 }} 章，共 {{ reader.chapters.length }} 章</span>
        </div>

        <div class="page__body" v-html="reader.chapterHtml" />

        <div class="page__end">
          <span class="page__end-line" />
          <span class="faint">本章完</span>
          <span class="page__end-line" />
        </div>

        <nav class="page__nav">
          <button class="btn" :disabled="reader.chapterIndex === 0" @click="reader.prevChapter()">
            <AppIcon name="chevronLeft" :size="16" />
            上一章
          </button>
          <button class="btn btn--ghost" @click="reader.openPanel('catalog')">查看目录</button>
          <button class="btn btn--primary" :disabled="isLastChapter" @click="reader.nextChapter()">
            下一章
            <AppIcon name="chevronRight" :size="16" />
          </button>
        </nav>
      </article>
    </div>

    <footer class="reader__foot">
      <div class="progress" :title="`全书进度 ${topPercent}`">
        <span class="progress__fill" :style="{ width: topPercent }" />
      </div>
      <div class="reader__foot-row">
        <span class="faint">
          {{ reader.chapterTitle }}
        </span>
        <span class="faint">{{ topPercent }}</span>
      </div>
    </footer>

    <Transition name="fade">
      <div v-if="flash" class="flash">{{ flash }}</div>
    </Transition>

    <Transition name="fade">
      <div v-if="reader.loading" class="loading">
        <span class="spinner" />
        正在读取正文…
      </div>
    </Transition>

    <NavPanel />
  </div>
</template>

<style scoped>
.reader {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.reader__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: auto;
}

/* ---- 正文版心 ---- */
.page {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: clamp(78px, 11vh, 116px) clamp(22px, 5vw, 46px) 40px;
}

.page__title {
  font-family: var(--font-stack);
  font-size: calc(var(--font-size) * 1.32);
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: var(--letter-spacing);
  text-wrap: balance;
}

.page__meta {
  display: flex;
  gap: 7px;
  margin-top: 10px;
  font-size: 12px;
  letter-spacing: 0.01em;
}

.page__meta::after {
  content: "";
  flex: 1;
  height: 1px;
  align-self: center;
  margin-left: 6px;
  background: var(--line);
}

.page__body {
  margin-top: 30px;
  font-family: var(--font-stack);
  font-size: var(--font-size);
  line-height: var(--line-height);
  letter-spacing: var(--letter-spacing);
  color: var(--fg);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.page__body :deep(p) {
  margin: 0 0 calc(var(--font-size) * 0.42);
  text-indent: var(--paragraph-indent);
  text-align: justify;
  text-justify: inter-ideograph;
}

.page__body :deep(p:last-child) {
  margin-bottom: 0;
}

.page__body :deep(mark) {
  padding: 1px 2px;
  border-radius: 3px;
  background: color-mix(in srgb, #e8b84b 52%, transparent);
  color: inherit;
}

/*
 * 正文里写死的 ==高亮==。底色用主题色而不是检索命中那抹黄，两者要能分得开；
 * 文字颜色沿用正文色（不跟着换成 accent），否则在浅色主题上变成浅底浅字、对比度不够。
 */
.page__body :deep(mark.hl) {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
  color: inherit;
}

.page__body :deep(.empty-chapter) {
  text-indent: 0;
  text-align: center;
  color: var(--faint);
}

/* ---- Markdown 正文 ---- */

/*
 * 标题一律用 em 而不是 px：字号滑块调的是 --font-size，
 * 用 em 才能让标题跟着正文一起缩放，否则调小字号后标题会显得越来越大。
 */
.page__body :deep(h1),
.page__body :deep(h2),
.page__body :deep(h3),
.page__body :deep(h4),
.page__body :deep(h5),
.page__body :deep(h6) {
  margin: 1.7em 0 0.62em;
  font-family: var(--font-stack);
  font-weight: 600;
  line-height: 1.42;
  letter-spacing: var(--letter-spacing);
  text-indent: 0;
  text-align: left;
  text-wrap: balance;
}

.page__body :deep(h1) {
  font-size: 1.55em;
}
.page__body :deep(h2) {
  font-size: 1.32em;
}
.page__body :deep(h3) {
  font-size: 1.16em;
}
.page__body :deep(h4) {
  font-size: 1.04em;
}
.page__body :deep(h5) {
  font-size: 0.98em;
}
.page__body :deep(h6) {
  font-size: 0.9em;
  color: var(--muted);
}

/* 正文第一块贴着头顶时不要再多一层外边距（章标题下已经给过间距了） */
.page__body :deep(> :first-child) {
  margin-top: 0;
}

.page__body :deep(blockquote) {
  margin: 1.1em 0;
  padding: 0.25em 0 0.25em 1.05em;
  border-left: 3px solid color-mix(in srgb, var(--accent) 42%, transparent);
  color: var(--muted);
}

.page__body :deep(blockquote p) {
  text-indent: 0;
  text-align: left;
}

.page__body :deep(ul),
.page__body :deep(ol) {
  margin: 0.85em 0;
  padding-left: 1.6em;
}

.page__body :deep(ul) {
  list-style: disc;
}
.page__body :deep(ol) {
  list-style: decimal;
}
.page__body :deep(ul ul) {
  list-style: circle;
}

.page__body :deep(li) {
  margin: 0.26em 0;
}

.page__body :deep(li > p) {
  text-indent: 0;
  text-align: left;
  margin-bottom: 0.4em;
}

.page__body :deep(li > p:last-child) {
  margin-bottom: 0;
}

/* 松散列表里的任务项是 <p class="task">，紧凑列表里是 <span class="task"> */
.page__body :deep(.task) {
  text-indent: 0;
  text-align: left;
}

.page__body :deep(.task input) {
  margin-right: 0.45em;
  accent-color: var(--accent);
  vertical-align: -0.06em;
}

.page__body :deep(code) {
  padding: 0.14em 0.36em;
  font-family: var(--font-mono);
  font-size: 0.9em;
  border-radius: 5px;
  background: var(--code-bg);
  color: color-mix(in srgb, var(--fg) 88%, var(--accent));
  overflow-wrap: anywhere;
}

.page__body :deep(pre.code) {
  margin: 1.1em 0;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--code-bg);
  text-indent: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.page__body :deep(pre.code code) {
  padding: 0;
  font-size: 0.88em;
  line-height: 1.68;
  background: none;
  color: inherit;
  border-radius: 0;
  white-space: pre;
  overflow-wrap: normal;
}

.page__body :deep(.tok--kw) {
  color: var(--tok-kw);
  font-weight: 600;
}
.page__body :deep(.tok--st) {
  color: var(--tok-st);
}
.page__body :deep(.tok--cm) {
  color: var(--tok-cm);
  font-style: italic;
}
.page__body :deep(.tok--nu) {
  color: var(--tok-nu);
}

.page__body :deep(.table-wrap) {
  margin: 1.1em 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.page__body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.94em;
  line-height: 1.55;
}

.page__body :deep(th),
.page__body :deep(td) {
  padding: 7px 11px;
  border: 1px solid var(--line);
  text-indent: 0;
  text-align: left;
  vertical-align: top;
}

.page__body :deep(th) {
  font-weight: 600;
  background: color-mix(in srgb, var(--fg) 5%, transparent);
}

.page__body :deep(hr) {
  margin: 1.9em 0;
  border: 0;
  border-top: 1px solid var(--line);
}

.page__body :deep(dl) {
  margin: 1.1em 0;
}

.page__body :deep(dt) {
  font-weight: 600;
}

.page__body :deep(dd) {
  margin: 0.2em 0 0.7em 1.3em;
  color: var(--muted);
}

.page__body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
  text-underline-offset: 3px;
}

.page__body :deep(a:hover) {
  text-decoration-color: currentColor;
}

.page__body :deep(.img-ref) {
  padding: 0.1em 0.4em;
  border-radius: 5px;
  background: color-mix(in srgb, var(--fg) 7%, transparent);
  color: var(--muted);
  font-size: 0.92em;
}

.page__body :deep(.fn-ref) {
  font-size: 0.72em;
  line-height: 0;
}

.page__body :deep(.fn-ref a) {
  text-decoration: none;
  font-weight: 600;
}

.page__body :deep(.footnotes) {
  margin-top: 2.2em;
  padding-top: 1.1em;
  border-top: 1px solid var(--line);
  font-size: 0.88em;
  color: var(--muted);
}

.page__body :deep(.footnotes h4) {
  margin: 0 0 0.5em;
  font-size: 0.95em;
  color: var(--faint);
  letter-spacing: 0.06em;
}

.page__body :deep(.footnotes ol) {
  margin: 0;
  padding-left: 1.4em;
}

.page__body :deep(.footnotes li) {
  margin: 0.3em 0;
}

.page__body :deep(.fn-back) {
  margin-left: 0.25em;
  text-decoration: none;
  opacity: 0.65;
}

/* ---- 章末 ---- */
.page__end {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: calc(var(--font-size) * 2.4);
  font-size: 12.5px;
}

.page__end-line {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.page__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 26px;
}

/* ---- 底部进度 ---- */
.reader__foot {
  flex: none;
  padding: 0 calc(clamp(12px, 2.6vw, 28px) + var(--safe-right)) calc(10px + var(--safe-bottom))
    calc(clamp(12px, 2.6vw, 28px) + var(--safe-left));
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
}

.progress {
  height: 3px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.progress__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.25s var(--ease);
}

.reader__foot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
  font-size: 11.5px;
}

.reader__foot-row span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 浮层 ---- */
.flash {
  position: absolute;
  z-index: 40;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 22px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 12px;
  background: color-mix(in srgb, var(--fg) 86%, var(--bg));
  color: var(--bg);
  box-shadow: var(--shadow-md);
  pointer-events: none;
}

.loading {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
  color: var(--muted);
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(4px);
}

.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  border-top-color: var(--accent);
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .page__body :deep(p) {
    text-align: left;
  }
}
</style>
