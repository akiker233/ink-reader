import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base 用相对路径：产物可以放在任意子目录下（GitHub Pages 项目页、Cloudflare Pages 都能直接用）
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1024
  }
})
