<script setup>
import { computed } from 'vue'
import { coverGradient } from '../utils/theme'
import { formatChars, formatDuration, relativeTime } from '../utils/text'
import AppIcon from './AppIcon.vue'

const props = defineProps({ book: { type: Object, required: true } })
const emit = defineEmits(['open', 'remove'])

const percent = computed(() => Math.min(100, Math.round((props.book.progress?.percent || 0) * 1000) / 10))
const gradient = computed(() => coverGradient(props.book.id))
const started = computed(() => percent.value > 0 && percent.value < 99.9)
const finished = computed(() => percent.value >= 99.9)
</script>

<template>
  <article class="card" @click="emit('open', book.id)">
    <div class="cover" :style="{ backgroundImage: gradient }">
      <span class="cover__spine" />
      <span class="cover__gloss" />
      <div class="cover__text">
        <h3 class="cover__title">{{ book.title }}</h3>
      </div>
      <span v-if="book.encoding && book.encoding !== 'utf-8'" class="cover__enc">{{ book.encoding }}</span>
      <span v-if="book.format === 'markdown'" class="cover__md">MD</span>

      <div class="cover__hover">
        <span class="cover__cta">
          <AppIcon :name="percent > 0 ? 'book' : 'plus'" :size="15" />
          {{ percent > 0 ? '继续阅读' : '开始阅读' }}
        </span>
      </div>

      <button class="cover__del" title="从书架移除" @click.stop="emit('remove', book)">
        <AppIcon name="trash" :size="15" />
      </button>
    </div>

    <div class="meta">
      <h4 class="meta__title" :title="book.title">{{ book.title }}</h4>
      <p class="meta__sub">
        {{ book.chapterCount }} 章 · {{ formatChars(book.wordCount) }}
      </p>

      <div class="bar" :title="`已读 ${percent}%`">
        <span class="bar__fill" :class="{ 'bar__fill--done': finished }" :style="{ width: `${percent}%` }" />
      </div>

      <div class="meta__foot">
        <span v-if="finished" class="badge badge--done">已读完</span>
        <span v-else-if="started" class="meta__percent">已读 {{ percent }}%</span>
        <span v-else class="faint">未开始</span>
        <span class="faint">{{ relativeTime(book.lastReadAt || book.createdAt) }}</span>
      </div>
      <p v-if="book.readSeconds > 30" class="meta__time faint">
        累计阅读 {{ formatDuration(book.readSeconds) }}
      </p>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  user-select: none;
}

.cover {
  position: relative;
  aspect-ratio: 3 / 4.3;
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: transform 0.28s var(--ease), box-shadow 0.28s var(--ease);
}

@media (hover: hover) {
  .card:hover .cover {
    transform: translateY(-5px);
    box-shadow: var(--shadow-md);
  }
}

.cover__spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 9px;
  background: linear-gradient(90deg, rgb(0 0 0 / 26%), rgb(255 255 255 / 12%) 60%, rgb(0 0 0 / 10%));
}

.cover__gloss {
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, rgb(255 255 255 / 20%), transparent 42%);
}

.cover__text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 26px 20px 34px 26px;
}

.cover__title {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
  color: rgb(255 255 255 / 95%);
  text-shadow: 0 1px 3px rgb(0 0 0 / 32%);
  word-break: break-word;
}

.cover__enc {
  position: absolute;
  left: 16px;
  bottom: 12px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  border-radius: 5px;
  background: rgb(0 0 0 / 30%);
  color: rgb(255 255 255 / 88%);
  text-transform: uppercase;
}

/* Markdown 标记放左上角：右下角已经有编码标签了，别挤在一起 */
.cover__md {
  position: absolute;
  top: 8px;
  left: 16px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  border-radius: 5px;
  background: rgb(255 255 255 / 86%);
  color: #2b2f33;
}

.cover__hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 16px;
  background: linear-gradient(transparent 45%, rgb(0 0 0 / 55%));
  opacity: 0;
  transition: opacity 0.24s var(--ease);
}

.cover__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: 999px;
  background: rgb(255 255 255 / 94%);
  color: #24272b;
}

.cover__del {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: rgb(0 0 0 / 38%);
  color: rgb(255 255 255 / 90%);
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 0.2s var(--ease), transform 0.2s var(--ease), background 0.2s;
}

@media (hover: hover) {
  .card:hover .cover__hover {
    opacity: 1;
  }

  .card:hover .cover__del {
    opacity: 1;
    transform: scale(1);
  }

  .cover__del:hover {
    background: #c0483a;
  }
}

/*
 * 触摸设备上压根没有 hover：照搬 hover 显隐，删除按钮就永远摸不到。
 * 所以让它常驻，但降一点透明度 —— 每张封面都顶着一个满饱和按钮太抢视线。
 * 同时去掉「继续阅读」浮层，那是给鼠标预备的，手指点封面本身就会打开书。
 */
@media (hover: none) {
  .cover__hover {
    display: none;
  }

  .cover__del {
    opacity: 0.72;
    transform: none;
    background: rgb(0 0 0 / 32%);
  }
}

@media (pointer: coarse) {
  .cover__del {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }

  .cover__del:active {
    opacity: 1;
    transform: scale(0.92);
    background: #c0483a;
  }
}

.meta {
  padding: 11px 2px 0;
}

.meta__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta__sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--faint);
}

.bar {
  height: 3px;
  margin: 9px 0 7px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.bar__fill {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.35s var(--ease);
}

.bar__fill--done {
  background: color-mix(in srgb, var(--accent) 70%, var(--fg));
}

.meta__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
}

.meta__percent {
  font-weight: 600;
  color: var(--accent);
}

.badge--done {
  background: var(--accent-soft);
  color: var(--accent);
}

.meta__time {
  margin-top: 4px;
  font-size: 11.5px;
}
</style>
