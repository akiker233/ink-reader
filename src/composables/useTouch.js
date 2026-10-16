import { ref } from 'vue'

/**
 * 是否触摸设备（无 hover 能力、粗指针）。
 *
 * 做成模块级单例而不是每个组件各建一个：
 * 「这台设备是不是触摸屏」全局只该有一个答案，
 * 而且插拔鼠标、翻转平板时也只需要维护一个监听。
 *
 * 样式层能用 @media (pointer: coarse) / (hover: none) 解决的，
 * 一律走 CSS；这个函数只给「CSS 表达不了」的场合用 ——
 * 比如工具条的显隐策略、书架空状态的文案。
 */
const mql = typeof window !== 'undefined' ? window.matchMedia('(hover: none), (pointer: coarse)') : null

const isTouch = ref(mql ? mql.matches : false)

mql?.addEventListener('change', (e) => {
  isTouch.value = e.matches
})

export function useTouch() {
  return { isTouch }
}
