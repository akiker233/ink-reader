<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'
import { useModalGuard } from '../composables/useModalGuard'
import AppIcon from './AppIcon.vue'

const reader = useReaderStore()
const settings = useSettingsStore()

const percent = computed(() => (reader.percent * 100).toFixed(1))

/**
 * 窄屏把最右边那几个收进「更多」。
 * 不按设备类型而是按宽度判断：窗口拉窄的桌面也一样会溢出，
 * 而且这样切分点只跟「放得下放不下」有关，跟输入方式无关。
 */
const menuOpen = ref(false)
const moreWrap = ref(null)

useModalGuard(computed(() => menuOpen.value))

/**
 * 「更多」里的条目。active() 用来给护眼这类开关画上已开启的状态，
 * 否则菜单一关就完全看不出它是不是开着。
 */
const MENU = computed(() => [
  {
    key: 'bookmarks',
    icon: 'bookmark',
    label: '书签',
    hint: reader.bookmarks.length ? `${reader.bookmarks.length}` : '',
    run: () => reader.openPanel('bookmarks')
  },
  {
    key: 'addBookmark',
    icon: 'bookmarkPlus',
    label: '在此处加书签',
    run: () => reader.addBookmarkAtCurrentPosition()
  },
  {
    key: 'eyeCare',
    icon: 'eye',
    label: '护眼模式',
    hint: settings.eyeCare ? '开' : '关',
    active: () => settings.eyeCare,
    run: () => settings.toggleEyeCare()
  },
  {
    key: 'settings',
    icon: 'sliders',
    label: '排版与外观',
    run: () => reader.openPanel('settings')
  },
  {
    key: 'top',
    icon: 'arrowUp',
    label: '回到章节顶部',
    run: () => reader.goChapter(reader.chapterIndex, 0)
  }
])

function runItem(item) {
  menuOpen.value = false
  item.run()
}

function onDocPointerDown(e) {
  if (!moreWrap.value?.contains(e.target)) menuOpen.value = false
}

watch(menuOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onDocPointerDown, true)
  else document.removeEventListener('pointerdown', onDocPointerDown, true)
})

// 工具条收起来时菜单必须一起关掉：它挂在工具条内部，跟着一起被推上去
watch(
  () => reader.toolbarVisible,
  (visible) => {
    if (!visible) menuOpen.value = false
  }
)

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))
</script>

<template>
  <header class="toolbar" :class="{ 'is-hidden': !reader.toolbarVisible }">
    <div class="toolbar__left">
      <button class="toolbar__back" title="返回书架 (Esc)" @click="reader.closeBook()">
        <AppIcon name="arrowLeft" :size="17" />
        <span>书架</span>
      </button>
      <div class="toolbar__title">
        <h2 :title="reader.title">{{ reader.title }}</h2>
        <p class="faint">{{ reader.chapterTitle }}</p>
      </div>
    </div>

    <div class="toolbar__center">
      <span class="pill">第 {{ reader.chapterIndex + 1 }} / {{ reader.chapters.length }} 章</span>
      <span class="pill pill--accent">{{ percent }}%</span>
    </div>

    <div class="toolbar__right">
      <button class="icon-btn" title="上一章 (←)" @click="reader.prevChapter()">
        <AppIcon name="chevronLeft" :size="18" />
      </button>
      <button class="icon-btn" title="下一章 (→)" @click="reader.nextChapter()">
        <AppIcon name="chevronRight" :size="18" />
      </button>

      <!-- 宽屏：全部功能平铺 -->
      <div class="toolbar__wide">
        <span class="sep" />

        <button
          class="icon-btn"
          :class="{ 'is-active': reader.activePanel === 'catalog' }"
          title="目录 (c)"
          @click="reader.openPanel('catalog')"
        >
          <AppIcon name="list" :size="18" />
        </button>
        <button
          class="icon-btn"
          :class="{ 'is-active': reader.activePanel === 'search' }"
          title="全文检索 (/)"
          @click="reader.openPanel('search')"
        >
          <AppIcon name="search" :size="18" />
        </button>
        <button
          class="icon-btn"
          :class="{ 'is-active': reader.activePanel === 'bookmarks' }"
          title="书签 (b)"
          @click="reader.openPanel('bookmarks')"
        >
          <AppIcon name="bookmark" :size="18" />
        </button>
        <button class="icon-btn" title="在此处添加书签" @click="reader.addBookmarkAtCurrentPosition()">
          <AppIcon name="bookmarkPlus" :size="18" />
        </button>

        <span class="sep" />

        <button
          class="icon-btn"
          :class="{ 'is-active': settings.eyeCare }"
          title="护眼模式 (e)"
          @click="settings.toggleEyeCare()"
        >
          <AppIcon name="eye" :size="18" />
        </button>
        <button
          class="icon-btn"
          :class="{ 'is-active': reader.activePanel === 'settings' }"
          title="排版与外观 (s)"
          @click="reader.openPanel('settings')"
        >
          <AppIcon name="sliders" :size="18" />
        </button>
        <button class="icon-btn" title="回到顶部" @click="reader.goChapter(reader.chapterIndex, 0)">
          <AppIcon name="arrowUp" :size="18" />
        </button>
      </div>

      <!-- 窄屏：只留目录 + 更多。目录面板里本来就有「书签 / 检索」两个页签，不算功能丢失 -->
      <div class="toolbar__narrow">
        <button
          class="icon-btn"
          :class="{ 'is-active': reader.activePanel === 'catalog' }"
          title="目录 / 书签 / 检索"
          @click="reader.openPanel('catalog')"
        >
          <AppIcon name="list" :size="18" />
        </button>

        <div ref="moreWrap" class="more">
          <button
            class="icon-btn"
            :class="{ 'is-active': menuOpen }"
            :aria-expanded="menuOpen"
            title="更多"
            @click="menuOpen = !menuOpen"
          >
            <AppIcon name="more" :size="18" />
          </button>

          <Transition name="pop">
            <div v-if="menuOpen" class="menu" role="menu">
              <button
                v-for="item in MENU"
                :key="item.key"
                class="menu__item"
                :class="{ 'is-on': item.active?.() }"
                role="menuitem"
                @click="runItem(item)"
              >
                <AppIcon :name="item.icon" :size="17" />
                <span class="menu__label">{{ item.label }}</span>
                <span v-if="item.hint" class="menu__hint">{{ item.hint }}</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  position: absolute;
  z-index: 20;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: calc(10px + var(--safe-top)) calc(clamp(12px, 2.6vw, 28px) + var(--safe-right)) 10px
    calc(clamp(12px, 2.6vw, 28px) + var(--safe-left));
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(14px) saturate(140%);
  transition: transform 0.3s var(--ease), opacity 0.24s var(--ease);
}

.toolbar.is-hidden {
  transform: translateY(-104%);
  opacity: 0;
  pointer-events: none;
}

.toolbar__left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1;
}

.toolbar__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px 0 10px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 9px;
  color: var(--muted);
  background: var(--hover);
  transition: background 0.18s var(--ease), color 0.18s var(--ease), transform 0.12s var(--ease);
}

.toolbar__back:active {
  transform: scale(0.95);
}

.toolbar__title {
  min-width: 0;
}

.toolbar__title h2 {
  font-size: 13.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar__title p {
  margin-top: 1px;
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar__center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pill {
  padding: 4px 10px;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 999px;
  background: var(--hover);
  color: var(--muted);
  white-space: nowrap;
}

.pill--accent {
  background: var(--accent-soft);
  color: var(--accent);
}

.toolbar__right {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 1;
  justify-content: flex-end;
}

/* 两种布局的容器本身都参与 flex，靠 display 切换 */
.toolbar__wide,
.toolbar__narrow {
  display: flex;
  align-items: center;
  gap: 3px;
}

.toolbar__narrow {
  display: none;
}

.sep {
  width: 1px;
  height: 18px;
  margin: 0 5px;
  background: var(--line);
}

/* ---- 更多菜单 ---- */
.more {
  position: relative;
  display: flex;
}

.menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 1;
  min-width: 200px;
  padding: 6px;
  border-radius: 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
  transform-origin: top right;
}

.menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  padding: 0 10px;
  font-size: 13.5px;
  text-align: left;
  border-radius: 10px;
  color: var(--fg);
  transition: background 0.16s var(--ease);
}

.menu__item:active {
  background: var(--hover);
}

.menu__item.is-on {
  color: var(--accent);
}

.menu__label {
  flex: 1;
}

.menu__hint {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--faint);
}

.menu__item.is-on .menu__hint {
  color: var(--accent);
}

@media (hover: hover) {
  .toolbar__back:hover {
    background: color-mix(in srgb, var(--fg) 13%, var(--bg));
    color: var(--fg);
  }

  .menu__item:hover {
    background: var(--hover);
  }
}

@media (pointer: coarse) {
  .toolbar__back {
    height: 44px;
    padding: 0 14px 0 12px;
  }
}

@media (max-width: 860px) {
  .toolbar__center {
    display: none;
  }

  .toolbar__back span {
    display: none;
  }
}

@media (max-width: 640px) {
  .toolbar__title p {
    display: none;
  }

  .toolbar__wide {
    display: none;
  }

  .toolbar__narrow {
    display: flex;
  }

  /* 窄屏上标题和按钮抢空间，留一点就够辨认在读哪本 */
  .toolbar__left {
    flex: 1 1 auto;
  }
}
</style>
