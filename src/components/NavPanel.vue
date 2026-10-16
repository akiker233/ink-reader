<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { formatChars, relativeTime } from '../utils/text'
import AppDrawer from './AppDrawer.vue'
import AppIcon from './AppIcon.vue'

const reader = useReaderStore()
const ui = useUiStore()

const NAV_TABS = ['catalog', 'bookmarks', 'search']
const open = computed(() => NAV_TABS.includes(reader.activePanel))

const catalogFilter = ref('')
const searchInput = ref(null)

const TITLES = { catalog: '目录', bookmarks: '书签', search: '全文检索' }

const filteredChapters = computed(() => {
  const key = catalogFilter.value.trim()
  const list = reader.chapters.map((c, i) => ({ ...c, index: i }))
  if (!key) return list
  return list.filter((c) => c.title.includes(key))
})

/** 章节很多时不做虚拟滚动，用「当前章前后各 600 条」限制渲染量 */
const visibleChapters = computed(() => {
  const list = filteredChapters.value
  if (list.length <= 1200 || catalogFilter.value.trim()) return list
  const from = Math.max(0, reader.chapterIndex - 600)
  return list.slice(from, from + 1200)
})

const searchWordCount = computed(() => reader.results.length)

watch(
  () => reader.activePanel,
  async (panel) => {
    if (panel !== 'search') return
    await nextTick()
    searchInput.value?.focus()
  }
)

function jumpToChapter(index) {
  reader.goChapter(index, 0)
  reader.closePanel()
}

function jumpToResult(item) {
  reader.goOffset(item.offset)
  reader.closePanel()
}

function jumpToBookmark(mark) {
  reader.goOffset(mark.offset)
  reader.closePanel()
}

async function removeBookmark(mark) {
  reader.removeBookmark(mark.id)
  ui.toast('书签已删除', 'success')
}

function runSearch() {
  reader.runSearch(reader.query)
}

function clearSearch() {
  reader.clearSearch()
}
</script>

<template>
  <AppDrawer
    :open="open"
    :title="TITLES[reader.activePanel] || ''"
    :subtitle="reader.title"
    :width="430"
    @close="reader.closePanel()"
  >
    <div class="tabs">
      <button
        v-for="tab in NAV_TABS"
        :key="tab"
        class="chip"
        :class="{ 'is-active': reader.navTab === tab }"
        @click="reader.navTab = tab"
      >
        <AppIcon :name="tab === 'catalog' ? 'list' : tab === 'bookmarks' ? 'bookmark' : 'search'" :size="14" />
        {{ TITLES[tab] }}
        <span v-if="tab === 'bookmarks' && reader.bookmarks.length" class="count">{{ reader.bookmarks.length }}</span>
        <span v-else-if="tab === 'search' && searchWordCount" class="count">{{ searchWordCount }}</span>
      </button>
    </div>

    <!-- 目录 -->
    <template v-if="reader.navTab === 'catalog'">
      <div class="field">
        <AppIcon name="search" :size="15" />
        <input v-model="catalogFilter" placeholder="筛选章节标题" />
        <button v-if="catalogFilter" class="icon-btn clear" @click="catalogFilter = ''">
          <AppIcon name="close" :size="14" />
        </button>
      </div>

      <p class="hint faint">
        共 {{ reader.chapters.length }} 章 · 识别规则为「{{ reader.chapters.length > 1 ? '自动匹配到的章节写法' : '无章节标记，按 1.2 万字切分' }}」
      </p>

      <ul class="list">
        <li v-for="c in visibleChapters" :key="c.index">
          <button
            class="row"
            :class="{ 'row--active': c.index === reader.chapterIndex }"
            @click="jumpToChapter(c.index)"
          >
            <span class="row__no">{{ c.index + 1 }}</span>
            <span class="row__text">{{ c.title }}</span>
            <span v-if="c.index === reader.chapterIndex" class="row__flag">当前</span>
          </button>
        </li>
      </ul>
      <p v-if="!filteredChapters.length" class="hint faint">没有匹配的章节。</p>
    </template>

    <!-- 书签 -->
    <template v-else-if="reader.navTab === 'bookmarks'">
      <p class="hint faint">
        书签记录「字符位置 + 当时的一句话」，点一下就能跳回去。阅读时会自动刷新所在位置。
      </p>

      <ul v-if="reader.bookmarks.length" class="list">
        <li v-for="mark in reader.bookmarks" :key="mark.id" class="mark">
          <button class="mark__main" @click="jumpToBookmark(mark)">
            <div class="mark__head">
              <span class="mark__chapter">{{ mark.chapterTitle }}</span>
              <span class="badge">{{ (mark.percent * 100).toFixed(1) }}%</span>
            </div>
            <p class="mark__excerpt">“{{ mark.excerpt }}”</p>
            <p class="mark__time faint">{{ relativeTime(mark.createdAt) }}</p>
          </button>
          <button class="icon-btn mark__del" title="删除书签" @click="removeBookmark(mark)">
            <AppIcon name="trash" :size="15" />
          </button>
        </li>
      </ul>

      <div v-else class="blank">
        <AppIcon name="bookmark" :size="30" :stroke="1.4" />
        <p>还没有书签</p>
        <p class="faint">阅读时点工具条上的「+书签」，或按 B 查看这里。</p>
      </div>
    </template>

    <!-- 检索 -->
    <template v-else>
      <div class="field">
        <AppIcon name="search" :size="15" />
        <input
          ref="searchInput"
          v-model="reader.query"
          placeholder="输入关键词后回车"
          @keydown.enter="runSearch"
        />
        <button v-if="reader.query" class="icon-btn clear" @click="clearSearch">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
      <button class="btn btn--primary search-btn" @click="runSearch">
        <AppIcon name="search" :size="15" />
        检索全文
      </button>

      <template v-if="reader.results.length">
        <p class="hint faint">
          找到 {{ reader.results.length }} 处{{ reader.results.length >= 200 ? '（已截断至前 200 条）' : '' }}
        </p>
        <ul class="list">
          <li v-for="(item, i) in reader.results" :key="i">
            <button class="row row--result" @click="jumpToResult(item)">
              <span class="result__chapter faint">{{ item.chapterTitle }}</span>
              <span class="result__text">
                {{ item.before }}<mark>{{ item.match }}</mark>{{ item.after }}
              </span>
            </button>
          </li>
        </ul>
      </template>

      <div v-else-if="reader.query.trim()" class="blank">
        <AppIcon name="info" :size="28" :stroke="1.4" />
        <p>没有找到「{{ reader.query }}」</p>
      </div>

      <div v-else class="blank">
        <AppIcon name="search" :size="30" :stroke="1.4" />
        <p>检索整本书</p>
        <p class="faint">命中结果会显示所在章节和前后文，点击跳转并在正文里高亮。</p>
      </div>
    </template>

    <template #footer>
      <p class="faint foot-hint">
        {{ formatChars(reader.wordCount) }} · 已读 {{ formatChars(reader.readWords) }}
      </p>
    </template>
  </AppDrawer>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 7px;
  margin-bottom: 14px;
}

.count {
  padding: 0 5px;
  font-size: 11px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--fg) 12%, transparent);
}

.hint {
  margin: 12px 0 8px;
  font-size: 12px;
  line-height: 1.65;
}

.list {
  margin-top: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  text-align: left;
  border-radius: 9px;
  font-size: 13.5px;
  transition: background 0.16s var(--ease), color 0.16s var(--ease);
}

.row:hover {
  background: var(--hover);
}

.row--active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.row__no {
  flex: none;
  width: 26px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--faint);
}

.row--active .row__no {
  color: var(--accent);
}

.row__text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__flag {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--accent);
  color: var(--accent-contrast);
}

.row--result {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px;
}

.result__chapter {
  font-size: 11px;
}

.result__text {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--muted);
  word-break: break-word;
}

.result__text mark {
  padding: 0 2px;
  border-radius: 3px;
  background: color-mix(in srgb, #e8b84b 55%, transparent);
  color: var(--fg);
  font-weight: 600;
}

.search-btn {
  width: 100%;
  margin-top: 9px;
}

.clear {
  width: 26px;
  height: 26px;
}

/* 书签 */
.mark {
  display: flex;
  align-items: stretch;
  gap: 4px;
  margin-bottom: 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel);
  overflow: hidden;
  transition: border-color 0.18s var(--ease);
}

.mark:hover {
  border-color: var(--line-strong);
}

.mark__main {
  flex: 1;
  min-width: 0;
  padding: 11px 12px;
  text-align: left;
}

.mark__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mark__chapter {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mark__excerpt {
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mark__time {
  margin-top: 7px;
  font-size: 11px;
}

.mark__del {
  width: 38px;
  height: auto;
  border-radius: 0;
  color: var(--faint);
}

.mark__del:hover {
  background: color-mix(in srgb, #d0503f 14%, var(--bg));
  color: #c0483a;
}

/* 空态 */
.blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 7px;
  padding: 54px 16px;
  color: var(--faint);
}

.blank p:first-of-type {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
}

.blank p {
  font-size: 12.5px;
  line-height: 1.7;
  max-width: 260px;
}

.foot-hint {
  font-size: 12px;
}
</style>
