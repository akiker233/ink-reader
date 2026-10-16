<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { THEMES, FONT_FAMILIES } from '../utils/theme'
import AppDrawer from './AppDrawer.vue'
import AppIcon from './AppIcon.vue'

const settings = useSettingsStore()
const reader = useReaderStore()
const ui = useUiStore()

const open = computed(() => reader.activePanel === 'settings')

const SHORTCUTS = [
  ['← / →', '上一章 / 下一章'],
  ['空格 / PgDn', '向下翻一屏'],
  ['↑ / ↓', '小幅滚动'],
  ['Home / End', '章首 / 章末'],
  ['+ / -', '字号增减'],
  ['C', '目录'],
  ['B', '书签'],
  ['/', '全文检索'],
  ['S', '本面板'],
  ['E', '护眼模式'],
  ['T', '切换配色'],
  ['Esc', '关闭面板 / 返回书架']
]

async function reset() {
  const ok = await ui.confirm({
    title: '恢复默认排版',
    message: '字号、行距、页宽、配色和护眼设置会全部回到初始值。',
    detail: '书架里的书、阅读进度和书签不受影响。',
    confirmText: '恢复默认'
  })
  if (ok) {
    settings.reset()
    ui.toast('已恢复默认设置', 'success')
  }
}
</script>

<template>
  <AppDrawer :open="open" title="排版与外观" subtitle="改动实时生效，并会记住" :width="420" @close="reader.closePanel()">
    <!-- 预览 -->
    <div class="preview" :style="settings.typographyVars">
      <p class="preview__text" :style="{ filter: 'var(--surface-filter)' }">
        书架上的每一本书都记着读到哪儿了。换个字号重新打开，位置依然是准的。
      </p>
      <span class="preview__tag faint">{{ settings.fontSize }}px / {{ settings.lineHeight }} 行距</span>
    </div>

    <!-- 这一项是每本书各自的，跟上面那些全局排版参数不是一回事 -->
    <section v-if="reader.bookId" class="sec sec--switch">
      <div>
        <label class="sec__label"><AppIcon name="book" :size="15" /> 按 Markdown 渲染</label>
        <p class="note faint">
          「{{ reader.title }}」当前按{{ reader.format === 'markdown' ? 'Markdown' : '纯文本' }}渲染。看后缀自动判断，判错了可以在这里改。
        </p>
      </div>
      <button
        class="switch"
        :class="{ 'is-on': reader.format === 'markdown' }"
        role="switch"
        :aria-checked="reader.format === 'markdown'"
        @click="reader.setBookFormat(reader.format === 'markdown' ? 'text' : 'markdown')"
      />
    </section>

    <!-- 分章口径也是每本书各自的，跟「渲染方式」互不影响：正文照旧按 Markdown 渲染，只是目录换一套切法 -->
    <section v-if="reader.bookId && reader.format === 'markdown'" class="sec sec--switch">
      <div>
        <label class="sec__label"><AppIcon name="list" :size="15" /> 目录按 # 标题切分</label>
        <p class="note faint">
          关掉后不再拿 Markdown 标题当章节，改按正文里的「第X章 / Chapter N」这类写法分章，# 和 ## 开头的行就只是正文里的层级标题。正文里也没有章节写法时，按 1.2 万字切节。
        </p>
      </div>
      <button
        class="switch"
        :class="{ 'is-on': reader.chapterSource === 'heading' }"
        role="switch"
        :aria-checked="reader.chapterSource === 'heading'"
        @click="reader.setChapterSource(reader.chapterSource === 'heading' ? 'plain' : 'heading')"
      />
    </section>

    <div class="divider" />

    <!-- 字号 -->
    <section class="sec">
      <div class="sec__head">
        <label class="sec__label"><AppIcon name="type" :size="15" /> 字号</label>
        <span class="value">{{ settings.fontSize }} px</span>
      </div>
      <div class="row-slider">
        <button class="icon-btn step" title="减小字号 ( - )" @click="settings.stepFontSize(-1)">
          <AppIcon name="minus" :size="15" />
        </button>
        <input
          class="slider"
          type="range"
          min="12"
          max="40"
          step="1"
          :value="settings.fontSize"
          @input="settings.setFontSize($event.target.value)"
        />
        <button class="icon-btn step" title="增大字号 ( + )" @click="settings.stepFontSize(1)">
          <AppIcon name="plus" :size="15" />
        </button>
      </div>
    </section>

    <!-- 字体 -->
    <section class="sec">
      <div class="sec__head">
        <label class="sec__label"><AppIcon name="book" :size="15" /> 字体</label>
      </div>
      <div class="chips">
        <button
          v-for="f in FONT_FAMILIES"
          :key="f.id"
          class="chip"
          :class="{ 'is-active': settings.fontFamily === f.id }"
          :style="{ fontFamily: f.stack }"
          @click="settings.fontFamily = f.id"
        >
          {{ f.name }}
        </button>
      </div>
    </section>

    <!-- 行距 -->
    <section class="sec">
      <div class="sec__head">
        <label class="sec__label"><AppIcon name="layers" :size="15" /> 行距</label>
        <span class="value">{{ settings.lineHeight.toFixed(2) }} ×</span>
      </div>
      <input
        class="slider"
        type="range"
        min="1.3"
        max="2.6"
        step="0.05"
        :value="settings.lineHeight"
        @input="settings.setLineHeight($event.target.value)"
      />
    </section>

    <!-- 页宽 -->
    <section class="sec">
      <div class="sec__head">
        <label class="sec__label"><AppIcon name="maximize" :size="15" /> 版心宽度</label>
        <span class="value">{{ settings.pageWidth }} px</span>
      </div>
      <input
        class="slider"
        type="range"
        min="480"
        max="1100"
        step="10"
        :value="settings.pageWidth"
        @input="settings.setPageWidth($event.target.value)"
      />
      <p class="note faint">行太长时眼睛折行容易串行，所以正文默认不铺满屏幕。</p>
    </section>

    <!-- 字间距 -->
    <section class="sec">
      <div class="sec__head">
        <label class="sec__label"><AppIcon name="sort" :size="15" /> 字间距</label>
        <span class="value">{{ settings.letterSpacing.toFixed(2) }} em</span>
      </div>
      <input
        class="slider"
        type="range"
        min="0"
        max="0.1"
        step="0.005"
        :value="settings.letterSpacing"
        @input="settings.letterSpacing = Number($event.target.value)"
      />
    </section>

    <!-- 首行缩进 -->
    <section class="sec sec--switch">
      <div>
        <label class="sec__label">首行缩进两字</label>
        <p class="note faint">关掉以后靠段间距区分段落，更接近网页阅读习惯。</p>
      </div>
      <button
        class="switch"
        :class="{ 'is-on': settings.indent }"
        role="switch"
        :aria-checked="settings.indent"
        @click="settings.indent = !settings.indent"
      />
    </section>

    <div class="divider" />

    <!-- 配色 -->
    <section class="sec">
      <div class="sec__head">
        <label class="sec__label"><AppIcon name="droplet" :size="15" /> 背景配色</label>
        <span class="value">{{ settings.theme.name }}</span>
      </div>
      <div class="swatches">
        <button
          v-for="t in THEMES"
          :key="t.id"
          class="swatch"
          :class="{ 'is-active': settings.themeId === t.id }"
          :title="t.name"
          @click="settings.themeId = t.id"
        >
          <span class="swatch__dot" :style="{ background: t.bg, color: t.fg }">
            <span class="swatch__a" :style="{ background: t.fg }" />
          </span>
          <span class="swatch__name">{{ t.name }}</span>
        </button>
      </div>
    </section>

    <div class="divider" />

    <!-- 护眼模式 -->
    <section class="sec sec--switch">
      <div>
        <label class="sec__label"><AppIcon name="eye" :size="15" /> 护眼模式</label>
        <p class="note faint">
          在<b>当前配色之上</b>叠一层低色温滤镜，和选背景色是两件独立的事：可以保留喜欢的配色，单独把色温降下来。
        </p>
      </div>
      <button
        class="switch"
        :class="{ 'is-on': settings.eyeCare }"
        role="switch"
        :aria-checked="settings.eyeCare"
        @click="settings.toggleEyeCare()"
      />
    </section>

    <section class="sec" :class="{ 'is-muted': !settings.eyeCare }">
      <div class="sec__head">
        <label class="sec__label">暖色强度</label>
        <span class="value">{{ settings.warmth }}%</span>
      </div>
      <input
        class="slider"
        type="range"
        min="0"
        max="100"
        step="5"
        :disabled="!settings.eyeCare"
        :value="settings.warmth"
        @input="settings.warmth = Number($event.target.value)"
      />
    </section>

    <section class="sec">
      <div class="sec__head">
        <label class="sec__label">屏幕亮度</label>
        <span class="value">{{ settings.brightness }}%</span>
      </div>
      <input
        class="slider"
        type="range"
        min="50"
        max="130"
        step="5"
        :value="settings.brightness"
        @input="settings.brightness = Number($event.target.value)"
      />
      <p class="note faint">夜间想再暗一点时用它，比去调系统亮度方便。</p>
    </section>

    <div class="divider" />

    <!-- 工具条显隐行为；手机上默认是滚动方向控制，有人更喜欢它一直挂着 -->
    <section class="sec sec--switch">
      <div>
        <label class="sec__label"><AppIcon name="sliders" :size="15" /> 顶部工具条常驻</label>
        <p class="note faint">
          关掉时：手机上往下滚会收起工具条、往上滚再展开；鼠标设备是光标离开页面顶端就收起。打开后它一直挂着。
        </p>
      </div>
      <button
        class="switch"
        :class="{ 'is-on': settings.keepToolbarOpen }"
        role="switch"
        :aria-checked="settings.keepToolbarOpen"
        @click="settings.keepToolbarOpen = !settings.keepToolbarOpen"
      />
    </section>

    <div class="divider" />

    <!-- 快捷键 -->
    <section class="sec">
      <div class="sec__head">
        <label class="sec__label"><AppIcon name="info" :size="15" /> 键盘快捷键</label>
      </div>
      <ul class="keys">
        <li v-for="[key, desc] in SHORTCUTS" :key="key">
          <kbd>{{ key }}</kbd>
          <span>{{ desc }}</span>
        </li>
      </ul>
    </section>

    <template #footer>
      <button class="btn btn--ghost reset" @click="reset">
        <AppIcon name="trash" :size="15" />
        恢复默认排版
      </button>
    </template>
  </AppDrawer>
</template>

<style scoped>
.preview {
  padding: 14px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--bg);
}

.preview__text {
  font-family: var(--font-stack);
  font-size: var(--font-size);
  line-height: var(--line-height);
  letter-spacing: var(--letter-spacing);
  text-indent: var(--paragraph-indent);
}

.preview__tag {
  display: block;
  margin-top: 10px;
  font-size: 11px;
  text-indent: 0;
}

.sec {
  margin-top: 22px;
}

.sec__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}

.sec__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
}

.value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  font-weight: 600;
}

.note {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.7;
}

.note b {
  color: var(--muted);
}

.row-slider {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--hover);
  color: var(--muted);
}

.step:hover {
  background: color-mix(in srgb, var(--fg) 13%, var(--bg));
  color: var(--fg);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.chips .chip {
  font-size: 13.5px;
}

.sec--switch {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.sec--switch .note {
  max-width: 300px;
}

.sec.is-muted {
  opacity: 0.5;
}

.divider {
  height: 1px;
  margin: 24px 0 0;
  background: var(--line);
}

.swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 7px 4px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: border-color 0.16s var(--ease), background 0.16s var(--ease);
}

.swatch:hover {
  background: var(--hover);
}

.swatch.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.swatch__dot {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-sm);
}

.swatch__a {
  width: 11px;
  height: 3px;
  border-radius: 2px;
}

.swatch__name {
  font-size: 10.5px;
  color: var(--muted);
}

.swatch.is-active .swatch__name {
  color: var(--accent);
  font-weight: 600;
}

.keys {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
}

.keys li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 5px 2px;
  font-size: 12.5px;
  color: var(--muted);
}

kbd {
  flex: none;
  min-width: 78px;
  padding: 3px 8px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  text-align: center;
  border-radius: 6px;
  background: var(--hover);
  border: 1px solid var(--line);
  color: var(--fg);
}

.reset {
  width: 100%;
}
</style>
