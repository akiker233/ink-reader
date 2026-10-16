/**
 * 纯函数文本处理：编码探测、章节识别、超长切分、检索、HTML 转义。
 * 不依赖 Vue / 浏览器状态，便于单独理解和测试。
 */

/** 单段正文的字数上限。超过就按段落边界切开，避免一次把几万字塞进 DOM。 */
export const MAX_SEGMENT = 12000

/** 单个 pattern 最多收集多少章，防止异常文件把内存打爆 */
const MAX_CHAPTERS = 8000

/**
 * 章节标题模板。中文小说常见的几种写法都覆盖了。
 * 靠「多条模板各自统计命中数，取命中最多的那条」来选，而不是写死一条正则，
 * 这样对纯章节名文件、Chapter N 英文文件、数字编号文件都能自适应。
 */
const CHAPTER_PATTERNS = [
  /^第\s*[0-9零一二三四五六七八九十百千万两]{1,12}\s*[章回节節卷篇部集话話]/,
  /^(?:chapter|part|section|volume|book)\s+[0-9ivxlcdm]+/i,
  /^[0-9]{1,4}\s*[、.．,，:：]\s*\S/,
  /^[（(]\s*[0-9零一二三四五六七八九十]{1,3}\s*[)）]/,
  /^[一二三四五六七八九十]{1,3}\s*[、.．]\s*\S/
]

/**
 * 从 ArrayBuffer 探测编码并解码为字符串。
 * 顺序：BOM → 空字节启发式（无 BOM 的 UTF-16）→ UTF-8 严格解码 → GB18030 → Big5 → UTF-8 宽松兜底。
 * 中文 TXT 最大的坑就是 GBK/ANSI 编码，用「UTF-8 严格模式解码失败就说明不是 UTF-8」来判定，
 * 比统计字频简单可靠得多。
 */
export function detectEncoding(buffer) {
  const bytes = new Uint8Array(buffer)
  if (!bytes.length) return { encoding: 'utf-8', text: '' }

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8-bom', text: decode('utf-8', bytes.subarray(3)) }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', text: decode('utf-16le', bytes.subarray(2)) }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', text: decode('utf-16be', bytes.subarray(2)) }
  }

  // 无 BOM 的 UTF-16 常见于 Windows 记事本另存，特征是大量 0x00 交替出现
  const probe = bytes.subarray(0, Math.min(bytes.length, 4096))
  let zeros = 0
  for (let i = 0; i < probe.length; i += 1) if (probe[i] === 0) zeros += 1
  if (zeros / probe.length > 0.2) {
    for (const enc of ['utf-16le', 'utf-16be']) {
      try {
        const text = new TextDecoder(enc, { fatal: true }).decode(bytes)
        if (!text.includes('\uFFFD')) return { encoding: enc, text }
      } catch {
        /* 试下一种 */
      }
    }
  }

  try {
    return { encoding: 'utf-8', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    /* 不是合法 UTF-8，继续试中文编码 */
  }

  for (const enc of ['gb18030', 'big5']) {
    try {
      return { encoding: enc, text: new TextDecoder(enc, { fatal: true }).decode(bytes) }
    } catch {
      /* 试下一种 */
    }
  }

  return { encoding: 'utf-8', text: decode('utf-8', bytes) }
}

function decode(encoding, bytes) {
  return new TextDecoder(encoding).decode(bytes)
}

/** 显示用的「字数」：不含空白字符 */
export function countChars(text) {
  let n = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    // 空格 / \t / \n / \r / 全角空格
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 0x3000) n += 1
  }
  return n
}

/**
 * 章节识别。返回 [{ title, start, head, end }]，都是正文字符下标：
 *   start —— 章节标题所在位置，用于进度换算（保持位置连续、不丢字符）
 *   head  —— 正文起点，即标题行之后；渲染时从这里取内容，标题由页面单独显示，避免重复
 * 任何情况下都会返回至少一段，保证后续「按章渲染」的逻辑不用写特例。
 */
export function parseChapters(text) {
  if (!text) return [{ title: '正文', start: 0, head: 0, end: 0 }]

  const hits = CHAPTER_PATTERNS.map(() => [])
  const lines = text.split('\n')
  let offset = 0

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i]
    if (rawLine.length <= 40) {
      const title = rawLine.trim()
      if (title) {
        for (let p = 0; p < CHAPTER_PATTERNS.length; p += 1) {
          if (hits[p].length >= MAX_CHAPTERS) break
          if (CHAPTER_PATTERNS[p].test(title)) {
            hits[p].push({
              title,
              at: offset + rawLine.indexOf(title),
              head: offset + rawLine.length + 1
            })
            break
          }
        }
      }
    }
    offset += rawLine.length + 1
  }

  let best = null
  for (const list of hits) {
    if (list.length >= 2 && (!best || list.length > best.length)) best = list
  }

  if (!best) {
    // 没有可识别的章节：按固定字数切分成「节」，保证阅读器永远有分页维度
    return chunk(text, 0, text.length).map((seg, i) => ({
      title: `第 ${i + 1} 节`,
      start: seg.start,
      head: seg.start,
      end: seg.end
    }))
  }

  const segments = best.map((item, i) => ({
    title: item.title,
    start: item.at,
    head: Math.min(item.head, i + 1 < best.length ? best[i + 1].at : text.length),
    end: i + 1 < best.length ? best[i + 1].at : text.length
  }))

  // 正文开头（书名、简介）在第一章标题之前，单独成为「序」
  if (segments[0].start > 0 && text.slice(0, segments[0].start).trim()) {
    segments.unshift({ title: '序', start: 0, head: 0, end: segments[0].start })
  }

  return splitOversized(segments, text)
}

/** 把超长章节按段落边界切成若干段，标题加「(k/n)」后缀 */
function splitOversized(segments, text) {
  const result = []
  for (const seg of segments) {
    if (seg.end - seg.start <= MAX_SEGMENT) {
      result.push(seg)
      continue
    }
    const parts = chunk(text, seg.head, seg.end)
    parts.forEach((part, i) => {
      result.push({
        title: i === 0 ? seg.title : `${seg.title}（续 ${i + 1}/${parts.length}）`,
        start: i === 0 ? seg.start : part.start,
        head: part.start,
        end: part.end
      })
    })
  }
  return result.length ? result : [{ title: '正文', start: 0, head: 0, end: text.length }]
}

/** 按 MAX_SEGMENT 切分，尽量落在换行处，避免把段落劈成两半 */
function chunk(text, start, end) {
  const out = []
  let cursor = start
  while (cursor < end) {
    let stop = Math.min(cursor + MAX_SEGMENT, end)
    if (stop < end) {
      const nl = text.lastIndexOf('\n', stop)
      if (nl > cursor + MAX_SEGMENT * 0.5) stop = nl + 1
    }
    out.push({ start: cursor, end: stop })
    cursor = stop
  }
  return out.length ? out : [{ start, end }]
}

/** 二分查找某个字符下标落在第几章 */
export function findChapterIndex(chapters, offset) {
  let lo = 0
  let hi = chapters.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (chapters[mid].start <= offset) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** 全文检索。用带 gi 的正则 exec 拿下标，避免 toLowerCase 在某些字符上改变长度导致偏移错位。 */
export function searchText(text, query, chapters, limit = 200) {
  const q = query.trim()
  if (!q || !text) return []
  const re = new RegExp(escapeRegExp(q), 'gi')
  const results = []
  let match
  while (results.length < limit && (match = re.exec(text)) !== null) {
    const offset = match.index
    results.push({
      offset,
      chapterIndex: findChapterIndex(chapters, offset),
      chapterTitle: chapters[findChapterIndex(chapters, offset)]?.title || '',
      before: snippet(text.slice(Math.max(0, offset - 20), offset)),
      match: match[0],
      after: snippet(text.slice(offset + match[0].length, offset + match[0].length + 26))
    })
    if (match[0].length === 0) re.lastIndex += 1
  }
  return results
}

function snippet(raw) {
  return raw.replace(/\s+/g, ' ')
}

export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

/**
 * 正文 → 段落 HTML。
 * 每一段都先转义再拼 mark 标签，用户导入的文本里就算带 <script> 也只会被当成字面量显示。
 */
export function toParagraphs(rawText, query = '') {
  const paragraphs = rawText.split(/\n+/)
  let html = ''
  for (const line of paragraphs) {
    const para = line.trim()
    if (!para) continue
    html += `<p>${query ? highlight(para, query) : escapeHtml(para)}</p>`
  }
  return html || '<p class="empty-chapter">（本章没有正文内容）</p>'
}

function highlight(text, query) {
  const q = query.trim()
  if (!q) return escapeHtml(text)
  const re = new RegExp(escapeRegExp(q), 'gi')
  let out = ''
  let last = 0
  let count = 0
  let match
  while (count < 300 && (match = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, match.index)) + `<mark>${escapeHtml(match[0])}</mark>`
    last = match.index + match[0].length
    if (match[0].length === 0) re.lastIndex += 1
    count += 1
  }
  return out + escapeHtml(text.slice(last))
}

export function formatChars(n) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)} 亿字`
  if (n >= 10000) return `${(n / 10000).toFixed(2)} 万字`
  return `${n.toLocaleString('zh-CN')} 字`
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  return `${h} 小时 ${m % 60} 分`
}

export function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function relativeTime(ts) {
  if (!ts) return '未阅读'
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)} 天前`
  return formatDate(ts).slice(0, 10)
}
