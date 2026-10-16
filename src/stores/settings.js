import { defineStore } from 'pinia'
import { getFont, getTheme, THEMES, DEFAULT_THEME } from '../utils/theme'

/**
 * 阅读排版与外观设置。
 * 这一层只存"用户偏好"，不存"某本书读到哪"（进度在 shelf 里，按书记录）。
 */
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    // 正文排版
    fontSize: 19,
    fontFamily: 'serif',
    lineHeight: 1.9,
    pageWidth: 760,
    indent: true,
    letterSpacing: 0.02,

    // 配色与光线
    themeId: DEFAULT_THEME,
    eyeCare: false,
    warmth: 45,
    brightness: 100,

    // 行为
    keepToolbarOpen: false
  }),

  getters: {
    theme: (state) => getTheme(state.themeId),
    font: (state) => getFont(state.fontFamily),
    isDark: (state) => ['dusk', 'ink'].includes(state.themeId),
    /** 排版相关的 CSS 变量，绑定到阅读容器上 */
    typographyVars: (state) => ({
      '--font-size': `${state.fontSize}px`,
      '--line-height': String(state.lineHeight),
      '--page-width': `${state.pageWidth}px`,
      '--letter-spacing': `${state.letterSpacing}em`,
      '--paragraph-indent': state.indent ? '2em' : '0em',
      '--font-stack': getFont(state.fontFamily).stack
    })
  },

  actions: {
    setFontSize(value) {
      this.fontSize = Math.min(40, Math.max(12, Math.round(value)))
    },
    stepFontSize(delta) {
      this.setFontSize(this.fontSize + delta)
    },
    setLineHeight(value) {
      this.lineHeight = Math.min(2.6, Math.max(1.3, Math.round(value * 100) / 100))
    },
    setPageWidth(value) {
      this.pageWidth = Math.min(1100, Math.max(480, Math.round(value / 10) * 10))
    },
    cycleTheme(direction = 1) {
      const ids = THEMES.map((t) => t.id)
      const cur = ids.indexOf(this.themeId)
      this.themeId = ids[(cur + direction + ids.length) % ids.length]
    },
    toggleEyeCare() {
      this.eyeCare = !this.eyeCare
    },
    reset() {
      this.$reset()
    }
  }
})
