/**
 * 主题与字体预设。
 * 每个主题只定义 4 个基础色（bg / panel / fg / accent），
 * 边框、次级文字等派生色在 CSS 里用 color-mix() 现算，
 * 这样加主题只要加 4 个颜色，不用维护一堆成套色板。
 *
 * 例外是代码着色：4 个基础色推不出「关键字该是什么颜色」，
 * 所以每个主题额外带一组 code 色（关键字 / 字符串 / 注释 / 数字 / 代码底）。
 * 取值按 WCAG 对比度挑过：关键字与字符串对代码底色 ≥ 4.5:1（正文级 AA），
 * 注释刻意压到 3.8 左右——它是补充信息，跟代码同等醒目反而干扰阅读；
 * 但每个主题都不低于 3.8，避免暗色主题下注释糊成一片灰。
 */

export const THEMES = [
  {
    id: 'paper', name: '宣纸', bg: '#f5f0e6', panel: '#fffcf5', fg: '#33302a', accent: '#2f6f63',
    code: { bg: '#efe7d7', kw: '#8c4a2f', st: '#2f6f63', cm: '#7b7365', nu: '#855a10' }
  },
  {
    id: 'white', name: '纯白', bg: '#f4f5f7', panel: '#ffffff', fg: '#1f2328', accent: '#2f6f63',
    code: { bg: '#eef0f3', kw: '#a3325a', st: '#1f6b4a', cm: '#6f757e', nu: '#7d5208' }
  },
  {
    id: 'celadon', name: '青瓷', bg: '#dbe8e3', panel: '#eef5f2', fg: '#22312c', accent: '#276152',
    code: { bg: '#cfdfd8', kw: '#8a4a3a', st: '#1d6a55', cm: '#5f6e69', nu: '#765610' }
  },
  {
    id: 'dusk', name: '暮色', bg: '#24262c', panel: '#2d3038', fg: '#c6cad2', accent: '#6fb3a3',
    code: { bg: '#1d1f24', kw: '#e0857a', st: '#8fc9a8', cm: '#7b818b', nu: '#dcb46a' }
  },
  {
    id: 'ink', name: '墨黑', bg: '#101114', panel: '#191a1f', fg: '#b4b8c0', accent: '#7cc0ae',
    code: { bg: '#0b0c0e', kw: '#e08b7f', st: '#8ecfa9', cm: '#6a6f78', nu: '#d8b268' }
  }
]

export const DEFAULT_THEME = 'paper'

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0]
}

export const FONT_FAMILIES = [
  {
    id: 'serif',
    name: '宋体',
    stack: '"Songti SC", "SimSun", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif'
  },
  {
    id: 'sans',
    name: '黑体',
    stack: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Source Han Sans SC", system-ui, sans-serif'
  },
  { id: 'kai', name: '楷体', stack: '"Kaiti SC", "KaiTi", "STKaiti", "BiauKai", serif' },
  { id: 'fangsong', name: '仿宋', stack: '"FangSong", "STFangsong", "FangSong_GB2312", serif' },
  { id: 'mono', name: '等宽', stack: '"JetBrains Mono", "Cascadia Mono", "Consolas", ui-monospace, monospace' }
]

export function getFont(id) {
  return FONT_FAMILIES.find((f) => f.id === id) || FONT_FAMILIES[0]
}

/**
 * 护眼滤镜。
 * 「背景色调整」和「护眼模式」被刻意拆成两个正交的开关：
 *   - 背景色是静态配色选择（想看着舒服就选）；
 *   - 护眼模式是动态的低色温 + 降对比处理，作用于整个阅读画面，强度可调。
 * 合成一个开关的话就没法「保留当前配色同时单独降色温」。
 */
export function buildSurfaceFilter({ eyeCare, warmth = 45, brightness = 100 }) {
  const parts = []
  if (eyeCare) {
    const k = Math.min(100, Math.max(0, warmth)) / 100
    parts.push(`sepia(${(0.04 + k * 0.3).toFixed(3)})`)
    parts.push(`saturate(${(1 - k * 0.14).toFixed(3)})`)
    parts.push(`hue-rotate(${(-k * 10).toFixed(2)}deg)`)
    parts.push(`contrast(${(1 - k * 0.05).toFixed(3)})`)
  }
  const b = Math.min(130, Math.max(50, brightness)) / 100
  if (b !== 1) parts.push(`brightness(${b.toFixed(3)})`)
  // 没有实际效果时必须返回 none：写成 brightness(1) 也会让浏览器建一层滤镜图层，
  // 长章节正文全量栅格化会明显拖慢滚动和重绘
  return parts.length ? parts.join(' ') : 'none'
}

/** 书脊封面的渐变色：由 id 哈希出一个色相，保证同一本书颜色固定 */
export function coverGradient(seed) {
  let hue = 0
  const str = String(seed)
  for (let i = 0; i < str.length; i += 1) hue = (hue * 31 + str.charCodeAt(i)) % 360
  const h2 = (hue + 26) % 360
  return `linear-gradient(148deg, hsl(${hue} 42% 58%), hsl(${h2} 46% 36%))`
}
